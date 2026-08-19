import { useState, useEffect, useRef } from "react";
import { store } from "./supabase.js";
import Logo from "./Logo.jsx";
import { PROJECTS as CANONICAL_PROJECTS } from "./projects.js";
import { safeDynamicImport } from "./lazyLoad.js";

// Marca Geotecnica
const ORANGE = "#E8762D";
const ORANGE_DARK = "#C75F1F";
const BEIGE = "#F5F0E8";
const CREAM = "#FFFBF5";
const DARK_BG = "#1F1B17";
const DARK_BORDER = "#3D3530";
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
};
// Lista canonica unificada con RRHH y Operations CC (src/projects.js).
const PROJECTS = CANONICAL_PROJECTS;
const UNITS = ["Unidad", "Bolsa", "Caja", "Rollo", "Galon", "Litro", "Kg", "Quintal", "Metro", "m2", "m3", "Par", "Set", "Servicio", "Global", "Viaje", "Hora"];
const PAYMENT_METHODS = ["Transferencia BAC", "Transferencia Banco Atlantida", "Transferencia Ficohsa", "Cheque", "Efectivo", "Tarjeta corporativa", "Otro"];

// Estados del proceso de Operaciones
const STATUSES = {
  borrador:   { label: "Borrador",                        color: "#64748b", bg: "#F1F5F9", order: 1, desc: "Operaciones aun no aprueba" },
  validado:   { label: "Aprobado por Coord. Operaciones", color: "#D97706", bg: "#FEF3C7", order: 2, desc: "Aprobado por Operaciones, en gestion de Tesoreria" },
  pagado:     { label: "Pagado (sin comprobante)",        color: "#2563EB", bg: "#DBEAFE", order: 3, desc: "Pago realizado, falta cargar comprobante" },
  finalizado: { label: "Finalizado",                      color: "#059669", bg: "#DCFCE7", order: 4, desc: "Pago con comprobante cargado" },
};

// Estados que maneja Tesoreria (paralelos al estado de Operaciones)
const TREASURY_STATUSES = {
  pendiente: { label: "Pendiente Lic. Carolina", color: "#B45309", bg: "#FEF3C7" },
  recibida:  { label: "Recibida",                color: "#1D4ED8", bg: "#DBEAFE" },
  pagada:    { label: "Pagada",                  color: "#047857", bg: "#D1FAE5" },
};

// Estados de Recepcion de Materiales (logistica, post-pago)
const DELIVERY_STATUSES = {
  pendiente_entrega: { label: "Pendiente de entrega",      color: "#7C3AED", bg: "#F3E8FF", icon: "📦" },
  entrega_proveedor: { label: "La entrega el proveedor",    color: "#0F766E", bg: "#CCFBF1", icon: "🏪" },
  recibido:          { label: "Materiales recibidos",       color: "#0891B2", bg: "#ECFEFF", icon: "✅" },
  ficha_adjunta:     { label: "Ficha de recibido adjunta",  color: "#059669", bg: "#DCFCE7", icon: "📋" },
  cerrado:           { label: "Compra cerrada",             color: "#059669", bg: "#DCFCE7", icon: "🔒" },
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

// ── CÓDIGO DE SOLICITUD (19-ago-2026) — espejo de GeoShopping ────────────
// MAQ-2026-0001 = repuestos/mantenimiento de maquinaria (vs MAT-… de
// materiales en GeoShopping). Ver el comentario largo en PurchasesModule.
const PREFIJO_CODIGO = "MAQ";
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


// Form de "La entrega el proveedor" — A NIVEL DE MÓDULO (regla del proyecto:
// definirlo adentro causa remount y pérdida de estado). Espejo del de
// GeoShopping: el proveedor lleva el repuesto directo al proyecto/plantel.
function EntregaDirectaFormImpl({ purchase, provider, setModal, marcarEntregaDirecta }) {
  const yaMarcada = purchase.delivery?.arrivalAt ? new Date(purchase.delivery.arrivalAt) : null;
  const manana = new Date();
  manana.setHours(0, 0, 0, 0);
  manana.setDate(manana.getDate() + 1);
  const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
  const [fecha, setFecha] = useState(local(yaMarcada || manana).slice(0, 10));
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
      <Input label="Fecha de llegada *" type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
      <Input label="Hora *" type="time" value={hora} onChange={e => setHora(e.target.value)} />
    </div>
    <Input label="Quien confirma del lado del proveedor" value={contacto} onChange={e => setContacto(e.target.value)} placeholder="Ej: Ing. Juan Perez" />
    <Textarea label="Notas (opcional)" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ej: entregan en portón principal, traen la factura física" />
    <div style={{ background: "#ECFDF5", border: "1px solid #6EE7B7", borderRadius: 10, padding: 12, fontSize: 12, color: "#065F46" }}>
      ✓ Esta compra <b>no se manda a Logística</b> — la trae el proveedor. Queda en "Entregas de proveedor"; cuando llegue, subís la ficha firmada.
    </div>
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 12, borderTop: "1px solid #E2E8F0" }}>
      <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
      <Btn disabled={sending || !fecha} onClick={async () => {
        if (!fecha) return alert("Poné la fecha de llegada.");
        setSending(true);
        try { const ok = await marcarEntregaDirecta(purchase, { fecha, hora, contacto, notas }); if (ok) setModal(null); }
        finally { setSending(false); }
      }}>{sending ? "Guardando…" : "🏪 Marcar entrega del proveedor"}</Btn>
    </div>
  </div>;
}

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

const Btn = ({ children, onClick, variant = "primary", small, style: sx, disabled, type }) => {
  const b = { border: "none", borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer", fontWeight: 600, fontSize: small ? 12 : 14, padding: small ? "5px 12px" : "9px 20px", opacity: disabled ? 0.5 : 1, fontFamily: "inherit", letterSpacing: 0.2 };
  const v = {
    primary: { ...b, background: ORANGE, color: "#fff", boxShadow: "0 2px 6px rgba(232,118,45,0.20)" },
    success: { ...b, background: "#5A8A4F", color: "#fff" },
    info: { ...b, background: "#2C5F5D", color: "#fff" },
    warn: { ...b, background: "#D4A017", color: "#fff" },
    danger: { ...b, background: "#C0392B", color: "#fff" },
    ghost: { ...b, background: "transparent", color: "#5C5853", border: "1px solid #DBD4C8" },
  };
  return <button type={type || "button"} style={{ ...(v[variant] || v.primary), ...sx }} onClick={onClick} disabled={disabled}>{children}</button>;
};

const Input = ({ label, ...p }) => <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{label && <label style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>{label}</label>}<input style={{ padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 14, outline: "none", background: "#F8FAFC" }} {...p} /></div>;

const Textarea = ({ label, ...p }) => <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{label && <label style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>{label}</label>}<textarea style={{ padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 14, outline: "none", background: "#F8FAFC", fontFamily: "inherit", resize: "vertical", minHeight: 70 }} {...p} /></div>;

const Select = ({ label, options, emptyLabel = "—", ...p }) => <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{label && <label style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>{label}</label>}<select style={{ padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 14, background: "#F8FAFC" }} {...p}><option value="">{emptyLabel}</option>{options.map(o => <option key={typeof o === "string" ? o : o.value} value={typeof o === "string" ? o : o.value}>{typeof o === "string" ? o : o.label}</option>)}</select></div>;

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
const FileSlot = ({ label, file, canUpload, onUpload, onRemove, accent = "#2563EB" }) => {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);

  // Abre un archivo, hidratandolo desde cloud si solo tiene fileId (sin dataUrl).
  // Ahora que la carga inicial NO hidrata archivos en bulk (para evitar saturar
  // Supabase), cada click "Ver/Descargar" tiene que cargar el archivo on-demand.
  const openFile = async () => {
    if (!file) return;
    let fileToOpen = file;
    if (!file.dataUrl && file.fileId) {
      setOpening(true);
      try {
        const full = await store.get(`cp-file-${file.fileId}`);
        if (!full?.dataUrl) {
          alert("❌ No se pudo cargar el archivo desde la nube.\n\nPuede ser un problema temporal de Supabase. Reintenta en unos segundos.");
          setOpening(false);
          return;
        }
        fileToOpen = { ...full, fileId: file.fileId };
      } catch (err) {
        alert("Error cargando archivo: " + (err?.message || err));
        setOpening(false);
        return;
      }
      setOpening(false);
    }
    if (fileToOpen.type?.startsWith("image/") || fileToOpen.type === "application/pdf") {
      const w = window.open();
      if (w) {
        w.document.write(`<!DOCTYPE html><html><head><title>${fileToOpen.name}</title></head><body style='margin:0;background:#222;display:flex;align-items:center;justify-content:center;min-height:100vh'>` +
          (fileToOpen.type === "application/pdf"
            ? `<iframe src='${fileToOpen.dataUrl}' style='width:100vw;height:100vh;border:none'></iframe>`
            : `<img src='${fileToOpen.dataUrl}' style='max-width:100vw;max-height:100vh'/>`) +
          `</body></html>`);
      }
    } else {
      // Trigger download for Excel/Word/etc
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
  return <span style={{ background: s.bg, color: s.color, padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", border: `1px solid ${s.color}30` }}>💼 {s.label}</span>;
};

// Delivery badge (estado de recepcion de materiales)
const DeliveryBadge = ({ status }) => {
  if (!status) return null;
  const s = DELIVERY_STATUSES[status];
  if (!s) return null;
  return <span style={{ background: s.bg, color: s.color, padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", border: `1px solid ${s.color}30` }}>{s.icon} {s.label}</span>;
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

  const xN = M, xCant = M + 8, xDesc = M + 30, xOk = M + 195, xObs = M + 221;
  const wDesc = xOk - xDesc - 4, wObs = PW - M - xObs;
  const rowH = 8;
  const firmasTop = PH - M - 52;
  const tableBottom = firmasTop - 4;

  // Header de la tabla — solo se dibuja cuando hay items estructurados.
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

  const sigW2 = (CW - 10) / 2;
  fc(BL); dc(DK); lw(0.5); rc(M, firmasTop, sigW2, 48, "FD");
  f(9.5, "bold"); tc(DK); doc.text("INGENIERO / RESIDENTE — RECIBE", M + sigW2 / 2, firmasTop + 6.5, { align: "center" });
  let sl = firmasTop + 14;
  lbl("Nombre completo", M + 5, sl); blk(M + 5, sl + 4.5, sigW2 - 10); sl += 10;
  lbl("Cargo", M + 5, sl); blk(M + 5, sl + 4.5, (sigW2 - 14) / 2);
  lbl("DNI", M + 5 + (sigW2 - 14) / 2 + 6, sl); blk(M + 5 + (sigW2 - 14) / 2 + 6, sl + 4.5, (sigW2 - 14) / 2); sl += 10;
  lbl("Firma", M + 5, sl); blk(M + 5, sl + 4.5, sigW2 - 10); sl += 9;
  f(6.5, "italic"); tc(GR);
  doc.text("Al firmar certifico que RECIBI las cantidades exactas arriba detalladas, completas y en buen estado.", M + 5, sl + 3, { maxWidth: sigW2 - 10 });

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
          upsertProjectMeta(cleanShort, { short: cleanShort, name: cleanName, code: f.code });
          if (onSaved) onSaved(cleanShort);
          setModal(null);
          alert(`Proyecto "${cleanShort}" creado. Ya podes usarlo al crear solicitudes.`);
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
          upsertProjectMeta(cleanShort, { short: cleanShort, name: cleanName, code: f.code });
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
function PurchaseFormImpl({ purchase, co, userName, setModal, getProject, allProjects, purchases, providers, machines, addAudit, saveOrAlert }) {
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState(purchase || {
    company: co, projectCode: "", provider: "", description: "",
    amount: "", quoteNumber: "", opsResponsible: userName || "",
    cierreResponsable: "", detalleMateriales: "",
    opsNotes: "", bacAccount: "", providerBank: "", providerAccountType: "", providerAccountHolder: "", providerRTN: "", quoteFile: null, receiptFile: null,
    machineId: "",
    status: "borrador", createdAt: new Date().toISOString(), audit: [],
    paymentMethod: "Transferencia BAC", paymentReference: "", paymentDate: "", treasuryNotes: "",
  });
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const linkedProject = getProject(f.projectCode);

  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <Select label="Empresa" options={[{ value: "subterra", label: "Subterra Honduras" }, { value: "geotecnica", label: "Geotecnica Soluciones" }]} value={f.company} onChange={e => u("company", e.target.value)} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "flex", justifyContent: "space-between" }}>
          <span>Proyecto</span>
          <button type="button" onClick={() => setModal({ t: "new-project", returnTo: purchase ? { t: "edit", d: purchase } : { t: "new" } })} style={{ background: "none", border: "none", color: "#BE185D", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>+ Nuevo proyecto</button>
        </label>
        <select style={{ padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 14, background: "#F8FAFC" }} value={f.projectCode} onChange={e => u("projectCode", e.target.value)}>
          <option value="">—</option>
          {allProjects.map(p => <option key={p.short} value={p.short}>{p.short} — {p.name}{p.isCustom ? " (nuevo)" : ""}{p.code ? "" : " · sin codigo"}</option>)}
        </select>
      </div>
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
            const newName = (e.target.value || "").trim();
            if (!newName) return;
            const match = (providers || []).find(p => (p.name || "").trim().toLowerCase() === newName.toLowerCase());
            if (!match) {
              console.log("[Autofill proveedor] Sin match para:", newName, "— providers cargados:", (providers || []).length);
              return;
            }
            console.log("[Autofill proveedor] Match:", match.name, "| cuentas:", match.bankAccounts?.length || 0);
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
      <div style={{ gridColumn: "1/-1" }}>
        <Select
          label="Maquina vinculada (opcional)"
          options={(machines || []).map(m => ({
            value: m.id,
            label: `${m.tipo === "compresor" ? "Compresor" : "Maquina"} — ${m.nombre}`,
          }))}
          emptyLabel="— Sin vincular —"
          value={f.machineId || ""}
          onChange={e => u("machineId", e.target.value)}
        />
      </div>
      <div style={{ gridColumn: "1/-1" }}>
        <Textarea label="Descripcion de la solicitud (repuesto, mantenimiento, etc.)" value={f.description} onChange={e => u("description", e.target.value)} placeholder="Detalle del repuesto, servicio o mantenimiento a pagar" />
      </div>
      <Input label="Monto total (Lempiras)" type="number" step="0.01" value={f.amount} onChange={e => u("amount", e.target.value)} placeholder="0.00" />
      <Input label="Responsable de Operaciones" value={f.opsResponsible} onChange={e => u("opsResponsible", e.target.value)} placeholder="Quien valida por Operaciones" />
      <Input label="Responsable de cierre contable" value={f.cierreResponsable || ""} onChange={e => u("cierreResponsable", e.target.value)} placeholder="Quien cierra esta compra con Contabilidad" />
      <div style={{ gridColumn: "1/-1" }}>
        <Textarea label="Detalle de repuestos / materiales (según cotización)" value={f.detalleMateriales || ""} onChange={e => u("detalleMateriales", e.target.value)} placeholder={"Qué se está comprando, tal cual la cotización. Un renglón por ítem:\n2 × Filtro hidráulico BAUER BG-28\n1 × Manguera 3/4 alta presión"} />
      </div>

      <div style={{ gridColumn: "1/-1", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
          💳 Datos bancarios del proveedor (opcional)
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Input label="Banco" value={f.providerBank || ""} onChange={e => u("providerBank", e.target.value)} placeholder="Ej: BAC, Banpais, Atlantida" />
          <Input label="Tipo de cuenta" value={f.providerAccountType || ""} onChange={e => u("providerAccountType", e.target.value)} placeholder="Ahorro / Cheques" />
          <Input label="Titular de la cuenta" value={f.providerAccountHolder || ""} onChange={e => u("providerAccountHolder", e.target.value)} placeholder="Nombre del titular" />
          <Input label="RTN" value={f.providerRTN || ""} onChange={e => u("providerRTN", e.target.value)} placeholder="0801-1990-12345" />
          <div style={{ gridColumn: "1/-1" }}>
            <Input label="Numero de cuenta" value={f.bacAccount} onChange={e => u("bacAccount", e.target.value)} placeholder="Ej: 10-251-000123" />
          </div>
        </div>
      </div>

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
          setSaving(true);
          try {
            const rec = { ...f, id: f.id || uid(), codigo: f.codigo || siguienteCodigo(purchases), status: "borrador", treasuryStatus: null };
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
          if (!f.quoteFile) { if (!confirm("No hay cotizacion adjunta. ¿Aprobar de todas formas?")) return; }
          setSaving(true);
          try {
            const rec = { ...f, id: f.id || uid(), codigo: f.codigo || siguienteCodigo(purchases), status: "validado", treasuryStatus: "pendiente", validatedAt: new Date().toISOString() };
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
    paymentDate: purchase.paymentDate || new Date().toISOString().slice(0, 10),
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
function ProviderFormImpl({ provider, setModal, upsertProvider, deleteProvider }) {
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
  </div>;
}

// ─────────────────────────────────────────────────────────────────────────
// MachineFormImpl: form CRUD para maquinaria (maquinas o compresores).
// Lic. Fernando Diaz registra aqui las maquinas para luego vincularlas
// a solicitudes de pago de repuestos/mantenimiento.
// ─────────────────────────────────────────────────────────────────────────
function MachineFormImpl({ machine, setModal, upsertMachine, deleteMachine }) {
  const [f, setF] = useState(machine || {
    id: "",
    tipo: "maquina",            // "maquina" | "compresor"
    nombre: "",
    diametroTipo: "",           // "pequeño" | "grande" | "" (solo aplica si tipo=maquina)
    diametroNotas: "",          // texto libre opcional (solo aplica si tipo=maquina)
    foto: null,
  });
  const [saving, setSaving] = useState(false);
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const isEdit = !!machine;

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <div style={{ background: "#EFF6FF", border: "1px solid #93C5FD", borderRadius: 10, padding: 12, fontSize: 12, color: "#1E40AF" }}>
      ⚙️ Registra una maquina o compresor para poder vincularla a las solicitudes de pago de repuestos / mantenimiento.
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <Select
        label="Tipo *"
        options={[
          { value: "maquina", label: "Maquina" },
          { value: "compresor", label: "Compresor" },
        ]}
        emptyLabel="—"
        value={f.tipo}
        onChange={e => u("tipo", e.target.value)}
      />
      <Input label="Nombre *" value={f.nombre} onChange={e => u("nombre", e.target.value)} placeholder="Ej: Perforadora #3, Compresor Atlas Copco" />
    </div>

    {f.tipo === "maquina" && (
      <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Diametro (solo maquinas)
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
          <Select
            label="Tipo de diametro"
            options={[
              { value: "pequeño", label: "Pequeño" },
              { value: "grande", label: "Grande" },
            ]}
            emptyLabel="—"
            value={f.diametroTipo || ""}
            onChange={e => u("diametroTipo", e.target.value)}
          />
          <Input
            label="Notas del diametro (opcional)"
            value={f.diametroNotas || ""}
            onChange={e => u("diametroNotas", e.target.value)}
            placeholder="Ej: 76mm HQ, 96mm PQ, etc."
          />
        </div>
      </div>
    )}

    <FileSlot
      label="Foto de la maquina (opcional)"
      file={f.foto}
      canUpload
      accent="#7C3AED"
      onUpload={fd => u("foto", fd)}
      onRemove={() => u("foto", null)}
    />

    {/* Botones */}
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, paddingTop: 12, borderTop: "1px solid #E2E8F0", alignItems: "center" }}>
      <div>
        {isEdit && deleteMachine && <Btn small variant="danger" onClick={async () => {
          if (!confirm(`¿Eliminar la maquina "${f.nombre}"? Esta accion no se puede deshacer.`)) return;
          await deleteMachine(f.id);
          setModal(null);
        }}>🗑 Eliminar maquina</Btn>}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="ghost" onClick={() => setModal(null)} disabled={saving}>Cancelar</Btn>
        <Btn variant="success" disabled={saving} onClick={async () => {
          if (!f.nombre?.trim()) return alert("El nombre es obligatorio");
          if (!f.tipo) return alert("Seleccione el tipo (maquina o compresor)");
          setSaving(true);
          try {
            await upsertMachine({ ...f, nombre: f.nombre.trim() });
            setModal(null);
          } finally {
            setSaving(false);
          }
        }}>{saving ? "..." : (isEdit ? "💾 Guardar" : "+ Crear maquina")}</Btn>
      </div>
    </div>
  </div>;
}

// ── MODULO ──
// ─────────────────────────────────────────────────────────────────────────
// SendPickupFormImpl: form para enviar una solicitud de Maquinas a Logistica
// como orden de recogida (mismo flujo que GeoShopping). Fernando lo usa
// despues de coordinar con el proveedor.
// ─────────────────────────────────────────────────────────────────────────
function SendPickupFormImpl({ purchase, provider, setModal, enviarAOrdenRecogida }) {
  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  const defaultDate = manana.toISOString().slice(0, 10);

  const [fechaConfirmada, setFechaConfirmada] = useState(defaultDate);
  const [contactoProveedor, setContactoProveedor] = useState(provider?.contactName || "");
  const [telefono, setTelefono] = useState(provider?.phones?.[0] || "");
  const [notas, setNotas] = useState("");
  const [sending, setSending] = useState(false);

  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ background: "#FEF3C7", border: "1px solid #F59E0B", borderRadius: 10, padding: 12, fontSize: 12, color: "#78350F" }}>
      <b>Solicitud:</b> {purchase.provider} — {purchase.description}<br />
      <b>Proyecto destino:</b> {purchase.projectCode}
    </div>
    <Input
      label="Fecha confirmada de retiro *"
      type="date"
      value={fechaConfirmada}
      onChange={e => setFechaConfirmada(e.target.value)}
      hint="Cuando el proveedor confirmo que se puede ir a retirar"
    />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <Input label="Persona de contacto en proveedor" value={contactoProveedor} onChange={e => setContactoProveedor(e.target.value)} placeholder="Ej: Ing. Juan Perez" />
      <Input label="Telefono del contacto" value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="Ej: +504 9999-9999" />
    </div>
    <Textarea
      label="Notas / instrucciones para el motorista"
      value={notas}
      onChange={e => setNotas(e.target.value)}
      placeholder={"Ej:\n• Direccion exacta del proveedor\n• Repuesto fragil — llevar amarrado\n• Pedir factura"}
    />
    <div style={{ background: "#ECFDF5", border: "1px solid #6EE7B7", borderRadius: 10, padding: 12, fontSize: 12, color: "#065F46" }}>
      ✓ Al enviar, esta orden cae automaticamente en el modulo de Logistica (mismo Kanban que las compras). Oscar/Jorge le asignan vehiculo + motorista.
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

export default function MachinesModule({ userRole, userName, onBack, onLogout }) {
  const isAdmin = userRole === "admin";
  const isTesoreria = userRole === "tesoreria";
  const isGerencia = userRole === "gerencia";
  const isCostos = userRole === "costos";
  const isRecepcion = userRole === "recepcion";
  const isAsistenteCompras = userRole === "asistente_compras";
  // Arturo (compras_ops) tiene permisos plenos en GeoShopping pero en Maquinas
  // sigue siendo SOLO LECTURA, igual que antes (no se le amplio el alcance).
  const isVisorCompras = userRole === "visor_compras" || userRole === "compras_ops";
  // Lic. Fernando Diaz — coordinador de maquinaria. Crea solicitudes de pago
  // de repuestos/mantenimiento y gestiona el catalogo de maquinas.
  const isCoordinadorMaquinas = userRole === "coordinador_maquinas";

  // Permisos (segregacion de funciones — modulo Maquinas):
  // admin → crea/edita/valida solicitudes y proyectos. NO paga.
  // costos (Lic. Christian Gallo) → MISMOS permisos que admin.
  // coordinador_maquinas (Lic. Fernando Diaz) → MISMOS permisos que admin en
  //         este modulo. Crea solicitudes, edita proyectos, gestiona maquinas.
  // tesoreria (Lic. Carolina) → UNICA que registra pago, sube comprobante,
  //         y cambia estado a pagado/finalizado.
  // gerencia → solo lectura.
  // recepcion / asistente_compras → roles legacy (compatibilidad con Compras),
  //         no se usan activamente en Maquinas.
  const canCreate = isAdmin || isCostos || isCoordinadorMaquinas;                 // crear/editar/validar solicitudes + editar proyectos
  const canPay = isTesoreria;                                                     // SOLO Carolina registra pago y cambia estado financiero
  const canViewOnly = isGerencia || isVisorCompras;                               // gerencia y visor de compras (Arturo) son read-only
  const canManageProviders = isAdmin || isCostos || isAsistenteCompras || isRecepcion || isCoordinadorMaquinas;  // CRUD de proveedores
  const canManageMachines = isAdmin || isCostos || isCoordinadorMaquinas || isRecepcion;  // CRUD de maquinas (Jorge incluido para cargar maquinas)
  // Flujo de logistica + fichas (mismo que GeoShopping, pedido 23-jul-2026):
  // Fernando coordina con el proveedor y envia la orden a GeoLogistics, o
  // cierra la compra sin logistica si el retiro no aplica (servicio en sitio,
  // lo recoge el mismo, etc.). Jorge sube fichas de recibido.
  const canEditDelivery = isAdmin || isCostos || isCoordinadorMaquinas || isRecepcion;
  const canSendToLogistics = isAdmin || isCostos || isCoordinadorMaquinas || isAsistenteCompras;

  const [co, setCo] = useState("geotecnica");
  const [purchases, setPurchases] = useState([]);
  const [customProjects, setCustomProjects] = useState([]);
  const [providers, setProviders] = useState([]);
  const [machines, setMachines] = useState([]);
  // Despachos compartidos con GeoLogistics (lg-despachos) — mismas ordenes de
  // recogida que usa GeoShopping. Una orden de Maquinas cae en el mismo Kanban
  // de Oscar/Jorge.
  const [despachos, setDespachos] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [modal, setModal] = useState(null);
  const isMobile = useIsMobile();
  // Default section depende del rol:
  // - Fernando (coordinador_maquinas) → "list" (Solicitudes)
  // - Ana (asistente_compras, legacy) → "providers"
  // - Jorge (recepcion, legacy) → "providers"
  // - admin/gerencia/costos/visor → "dashboard"
  // - Resto → "list" (solicitudes)
  const canSeeDashboardDefault = isAdmin || isGerencia || isCostos || isVisorCompras;
  const defaultSec = isCoordinadorMaquinas ? "list" : isAsistenteCompras ? "providers" : isRecepcion ? "providers" : canSeeDashboardDefault ? "dashboard" : "list";
  const [sec, setSec] = useState(defaultSec);
  // Filtro de mes de "Por cerrar contablemente" (por fecha de PAGO).
  // Default: mes actual — el histórico viejo no se le viene encima a nadie,
  // pero queda accesible eligiendo el mes o "Todos".
  const [contaMes, setContaMes] = useState(() => new Date().toISOString().slice(0, 7));
  // Filtros del archivo de cerradas contablemente (mes de cierre / proyecto / texto)
  const [cerrMes, setCerrMes] = useState("");
  const [cerrProy, setCerrProy] = useState("");
  const [cerrQ, setCerrQ] = useState("");
  // Mes del reporte ejecutivo de costos de maquinaria (pestaña Costos —
  // SOLO admin/gerencia/costos: Fernando no la ve ni exporta).
  const [costosMesEjec, setCostosMesEjec] = useState(() => new Date().toISOString().slice(0, 7));
  const [filter, setFilter] = useState({ status: "", project: "", provider: "", from: "", to: "" });
  // Estado del Command Center (Resumen). showCompleted: incluir completas.
  // projectCode: filtrar a un solo proyecto. month: mes de carga (default
  // mes actual — igual que GeoShopping; "" = todos).
  const [resumenFilter, setResumenFilter] = useState({
    showCompleted: false,
    projectCode: "",
    month: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
  });
  // Mes de las metricas mensuales del Dashboard ("" = mes actual).
  const [dashMonth, setDashMonth] = useState("");

  useEffect(() => {
    (async () => {
      const [p, cps, prov, mach, desp] = await Promise.all([
        store.get("mq-purchases"),
        store.get("cp-projects"),
        store.get("cp-providers"),
        store.get("mq-machines"),
        store.get("lg-despachos"),
      ]);
      if (Array.isArray(desp)) setDespachos(desp);
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
      if (Array.isArray(mach)) setMachines(mach);

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
        // Solo guardar si hubo imports nuevos — y via mergeById contra la
        // nube fresca: la base del mount puede ser cache local viejo y un
        // write directo pisaria proveedores creados por otros (fix ago 2026).
        (async () => {
          const merged = await mergeById("cp-providers", finalProviders, existingProviders);
          // Aplicar sobre el estado ACTUAL (el usuario pudo editar/crear un
          // proveedor durante el round-trip): se agregan solo los que faltan.
          setProviders((cur) => {
            const k = new Set(cur.map(unitKey).filter(Boolean));
            const add = merged.filter(x => { const u = unitKey(x); return u && !k.has(u); });
            return add.length ? [...cur, ...add] : cur;
          });
          const ok = await store.set("cp-providers", merged);
          console.info(`[Compras] Auto-importados ${importedFromPurchases.length} proveedores nuevos desde compras existentes.`, ok ? "" : "(no sincronizó a la nube)");
        })();
      }

      setLoaded(true);
    })();
  }, []);

  // Auto-refresh al volver a la pestaña — si Carolina subio un comprobante mientras
  // admin/Christian/Ana estaban en otra tab, al volver ven el cambio sin recargar.
  useEffect(() => {
    const refreshFromCloud = async () => {
      try {
        const [p, mach] = await Promise.all([
          store.get("mq-purchases"),
          store.get("mq-machines"),
        ]);
        if (Array.isArray(p)) {
          const migrated = p.map(x => ({
            ...x,
            treasuryStatus: deriveTreasury(x),
            deliveryStatus: deriveDelivery(x),
            delivery: x.delivery || {},
          }));
          setPurchases(migrated);
          // NO bulk-hidratar archivos en focus tampoco — load on-demand evita
          // saturar Supabase. Archivos se cargan al abrir detalle/generar PDF.
        }
        if (Array.isArray(mach)) setMachines(mach);
      } catch (e) {
        console.warn("[Maquinas] Auto-refresh fallo:", e?.message || e);
      }
    };
    const onFocus = () => refreshFromCloud();
    const onVisChange = () => { if (document.visibilityState === "visible") refreshFromCloud(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisChange);
    return () => {
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

      // 1) PRE-FETCH cloud DIRECTO (fix ago 2026 — se borraban solicitudes de
      // Fernando): antes se usaba store.get, que ante un timeout de Supabase
      // cae al CACHE LOCAL de este navegador. Con cache viejo, el merge no
      // veia las solicitudes nuevas de otros y las escribia FUERA de la nube
      // (y la verificacion no lo detectaba porque comparaba contra lo recien
      // escrito). Ahora: getCloud SIN cache — y si la nube no responde, NO se
      // guarda (mejor reintentar que borrar lo ajeno en silencio).
      let cloudPrevia;
      try {
        cloudPrevia = await store.getCloud("mq-purchases");
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
      // (removePurchase con confirm). Mas de una de golpe huele a state
      // corrupto/viejo — pedir confirmacion antes de borrarlas de la nube.
      if (deletedIds.size > 1) {
        const nombres = cloudPreviaArr.filter(p => deletedIds.has(p.id)).map(p => `• ${p.description || p.id}`).join("\n");
        if (!confirm(`⚠️ Este guardado ELIMINARÍA ${deletedIds.size} solicitudes de la nube:\n\n${nombres}\n\n¿Es intencional? (Si no borraste nada, tocá Cancelar y recargá la página.)`)) {
          console.warn("⛔ Guardado cancelado por el usuario (guardia anti-borrado masivo).");
          return false;
        }
      }

      // 3) MERGE: tomar todo lo de cloud + agregar lo nuestro que no este en cloud
      // (basado en id), EXCLUYENDO los que acabamos de borrar.
      const cloudExtras = cloudPreviaArr.filter(p => !ourIds.has(p.id) && !deletedIds.has(p.id));
      const merged = [...d, ...cloudExtras];
      if (cloudExtras.length > 0) {
        console.warn(`⚠️ Encontradas ${cloudExtras.length} solicitudes en cloud que no estaban en local — mergeadas.`);
        setPurchases(merged); // actualizar UI con merge
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
      // mq-purchases — evita refs huerfanas. El usuario reintenta.
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

      // 5) Save mq-purchases SOLO si todos los archivos subieron OK.
      let purchasesOk = false;
      if (failedFiles.length > 0) {
        console.error(`⛔ ${failedFiles.length} archivo(s) fallaron — NO guardo mq-purchases para evitar refs huerfanas.`);
      } else {
        purchasesOk = await store.set("mq-purchases", light);
        console.log("☁️ Save mq-purchases →", purchasesOk ? "OK" : "FAIL");
      }

      // 6) VERIFICACION: re-fetch DIRECTO desde cloud y comparar (getCloud —
      // store.get podia devolver el propio cache local y dar un falso OK)
      let verifiedOk = true;
      let verifiedCount = null;
      if (purchasesOk) {
        try {
          const verify = await store.getCloud("mq-purchases");
          verifiedCount = Array.isArray(verify) ? verify.length : null;
          if (verifiedCount !== light.length) {
            verifiedOk = false;
            console.error("❌ VERIFICACION FALLO. Enviado:", light.length, "Cloud devolvio:", verifiedCount);
          } else {
            // Tambien verificar que los IDs coinciden
            const verifyIds = new Set(verify.map(p => p.id));
            const missing = light.filter(p => !verifyIds.has(p.id));
            if (missing.length > 0) {
              verifiedOk = false;
              console.error("❌ Cloud devolvio el count correcto pero le faltan IDs:", missing.map(p => p.id));
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
  // Merge por id contra la NUBE fresca (fix ago 2026): estas keys las
  // escriben varios modulos/usuarios y el saver viejo escribia el array
  // completo desde el state local — una pestaña con datos viejos pisaba lo
  // creado por otros. Base = local nuevo; se rescata lo del cloud que el
  // caller no conoce, respetando lo que quito a proposito (vs state previo).
  // Si la nube no responde, se escribe lo local tal cual (store.set guarda
  // en localStorage y reintenta) — sin rescate, pero sin bloquear el CRUD.
  // La identidad de la unidad NO siempre es `id`: cp-projects se lleva por
  // `short` (sus registros nunca tuvieron id) — con la clave equivocada el
  // merge no rescataba nada y seguia pisando lo ajeno.
  const unitKey = (x) => (x && (x.id || x.short || x.name)) || null;
  const mergeById = async (key, next, prevArr) => {
    let cloudArr = null;
    try { const c = await store.getCloud(key); if (Array.isArray(c)) cloudArr = c; } catch { /* nube caída */ }
    if (!cloudArr) return next;
    const nextK = new Set(next.map(unitKey).filter(Boolean));
    const prevK = new Set((prevArr || []).map(unitKey).filter(Boolean));
    const deleted = new Set([...prevK].filter(k => !nextK.has(k)));
    const extras = cloudArr.filter(x => { const k = unitKey(x); return k && !nextK.has(k) && !deleted.has(k); });
    return extras.length ? [...next, ...extras] : next;
  };
  // Los savers pintan PRIMERO lo local (la UI no espera el round-trip a la
  // nube) y recien despues aplican el merge con lo que otros crearon.
  const sCP = async (d) => {
    setCustomProjects(d);
    const merged = await mergeById("cp-projects", d, customProjects);
    if (merged !== d) setCustomProjects(merged);
    return await store.set("cp-projects", merged);
  };

  // ── CRUD de Proveedores (cp-providers es COMPARTIDA con GeoShopping) ──
  const saveProviders = async (next) => {
    setProviders(next);
    const merged = await mergeById("cp-providers", next, providers);
    if (merged !== next) setProviders(merged);
    return await store.set("cp-providers", merged);
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

  // ── CRUD de Maquinas (catalogo de maquinaria) ──
  const saveMachines = async (next) => {
    setMachines(next);
    const merged = await mergeById("mq-machines", next, machines);
    if (merged !== next) setMachines(merged);
    return await store.set("mq-machines", merged);
  };
  const upsertMachine = async (m) => {
    const exists = machines.find(x => x.id === m.id);
    const updated = { ...m, updatedAt: new Date().toISOString() };
    const next = exists
      ? machines.map(x => x.id === m.id ? updated : x)
      : [...machines, { ...updated, id: m.id || uid(), createdAt: new Date().toISOString() }];
    return await saveMachines(next);
  };
  const deleteMachine = async (id) => {
    return await saveMachines(machines.filter(x => x.id !== id));
  };
  const cp = purchases.filter(p => p.company === co);

  // ── Enviar solicitud de Maquinas a Logistica como orden de recogida ──
  // Mismo contrato que GeoShopping (lg-despachos compartido): pre-fetch cloud,
  // idempotencia por sourcePurchaseId, merge, save y verificacion post-save.
  const enviarAOrdenRecogida = async (purchase, opts = {}) => {
    console.group(`[MQ enviarAOrdenRecogida] ${new Date().toISOString()}`);
    try {
      const rec = {
        id: uid(),
        source: "maquinas",
        sourcePurchaseId: purchase.id,
        tipo: "repuesto_maquinas",
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
        notas: opts.notas ? `[Coord. con proveedor — Maquinas]\n${opts.notas}` : "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      // 1) PRE-FETCH cloud (no pisar lo que Oscar/Jorge/Ana agregaron)
      const cloudPrevio = await store.get("lg-despachos");
      const cloudArr = Array.isArray(cloudPrevio) ? cloudPrevio : [];
      // 2) Idempotencia
      const existenteCloud = cloudArr.find(d => d.sourcePurchaseId === purchase.id);
      if (existenteCloud) {
        console.warn("Ya existe despacho para esta solicitud:", existenteCloud.id);
        setDespachos(cloudArr);
        return { ok: true, despachoId: existenteCloud.id, alreadyExisted: true };
      }
      // 3) Merge cloud (autoritativo) + local-only + nuevo
      const cloudIds = new Set(cloudArr.map(d => d.id));
      const localOnly = despachos.filter(d => !cloudIds.has(d.id));
      const merged = [...cloudArr, ...localOnly, rec];
      // 4) Save + 5) verificacion
      setDespachos(merged);
      const okSave = await store.set("lg-despachos", merged);
      let verifiedOk = okSave;
      if (okSave) {
        try {
          const verify = await store.get("lg-despachos");
          verifiedOk = Array.isArray(verify) && !!verify.find(d => d.id === rec.id);
        } catch { /* verificacion best-effort */ }
      }
      console.log("OK:", verifiedOk);
      return { ok: verifiedOk, despachoId: rec.id };
    } finally {
      console.groupEnd();
    }
  };

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
    return result;
  };
  const allProjects = getAllProjects();
  const getProject = (short) => allProjects.find(p => p.short === short);

  // Actualizar metadata custom de un proyecto (base o nuevo)
  const upsertProjectMeta = (short, patch) => {
    const base = PROJECTS.find(p => p.short === short);
    const existing = customProjects.find(cp => cp.short === short);
    if (existing) {
      sCP(customProjects.map(cp => cp.short === short ? { ...cp, ...patch } : cp));
    } else {
      const seed = base ? { short: base.short, name: base.name, code: base.code } : { short };
      sCP([...customProjects, { ...seed, ...patch, createdAt: new Date().toISOString() }]);
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

  // ── FLUJO DE CIERRE (ago 2026, espejo de GeoShopping) ──
  // La entrega el proveedor / ficha firmada / cierre contable con paquete.
  const marcarEntregaDirecta = async (purchase, { fecha, hora, contacto, notas }) => {
    const arrivalAt = new Date(`${fecha}T${hora || "00:00"}`).toISOString();
    const rec = {
      ...purchase,
      deliveryStatus: "entrega_proveedor",
      delivery: { ...(purchase.delivery || {}), entregaDirecta: true, arrivalAt, arrivalContacto: contacto || "", arrivalNotas: notas || "", expectedDate: fecha, coordinadoPor: userName, updatedAt: new Date().toISOString() },
    };
    const saved = addAudit(rec, "entrega_directa_proveedor", `Proveedor entrega en proyecto el ${fecha} ${hora || ""}`.trim());
    const ok = await updatePurchase(saved);
    if (!ok) alert("⚠️ Se marcó en este dispositivo pero NO se sincronizó a la nube. Reintentá.");
    return ok;
  };
  const revertirEntregaDirecta = async (purchase) => {
    if (!confirm(`¿El proveedor NO la va a entregar?\n\n${purchase.provider} — ${purchase.description}\n\nVuelve a "Por coordinar" para mandarla a Logística.`)) return false;
    const rec = { ...purchase, deliveryStatus: "pendiente_entrega", delivery: { ...(purchase.delivery || {}), entregaDirecta: false, updatedAt: new Date().toISOString() } };
    const saved = addAudit(rec, "entrega_directa_revertida", "El proveedor no la entrega — vuelve a coordinacion");
    const ok = await updatePurchase(saved);
    if (!ok) alert("⚠️ Se revirtió en este dispositivo pero NO se sincronizó. Reintentá.");
    return ok;
  };
  // Subida atómica de archivo + enlace a la compra (patrón anti-pérdida de
  // GeoShopping: archivo a row propia, pre-fetch getCloud, abort sin nube).
  const subirYEnlazar = async (purchase, fileObj, aplicar) => {
    if (!fileObj) return false;
    if (fileObj.size > 2 * 1024 * 1024) { alert(`❌ El archivo pesa ${(fileObj.size / 1024 / 1024).toFixed(2)} MB (límite 2 MB). Comprimilo antes de subir.`); return false; }
    try {
      const dataUrl = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(fileObj); });
      const fileId = uid();
      const okFile = await store.set(fileKey(fileId), { name: fileObj.name, type: fileObj.type, size: fileObj.size, dataUrl });
      if (!okFile) { alert("⚠️ No se pudo subir el archivo a la nube. Reintentá."); return false; }
      let cloud;
      try { cloud = await store.getCloud("mq-purchases"); }
      catch { alert("⚠️ Sin conexión con la nube. El archivo subió pero NO se enlazó — reintentá."); return false; }
      if (!Array.isArray(cloud)) { alert("⚠️ No se pudo leer la lista desde la nube. Reintentá."); return false; }
      const idx = cloud.findIndex(x => x.id === purchase.id);
      if (idx === -1) { alert("⚠️ No se encontró la solicitud. Recargá la página."); return false; }
      const next = [...cloud];
      next[idx] = aplicar(cloud[idx], { fileId, name: fileObj.name, type: fileObj.type, size: fileObj.size });
      const okSave = await store.set("mq-purchases", next);
      if (!okSave) { alert("⚠️ El archivo subió pero no se enlazó. Reintentá."); return false; }
      setPurchases(next);
      return true;
    } catch (err) { alert("Error subiendo archivo: " + (err?.message || err)); return false; }
  };
  const uploadFichaFromCard = (purchase, fileObj) => subirYEnlazar(purchase, fileObj, (orig, ref) => ({
    ...orig,
    deliveryStatus: "ficha_adjunta",
    delivery: { ...(orig.delivery || {}), fichaFile: ref, fichaScanned: true, fichaUploadedAt: new Date().toISOString() },
    audit: [...(orig.audit || []), { action: "ficha_uploaded_from_kanban", by: userName || userRole, role: userRole, at: new Date().toISOString(), note: `Ficha firmada subida: ${ref.name}` }],
  }));
  // tipo "factura" = solo la factura escaneada (lo normal); "paquete" = todo
  // el paquete digitalizado. Cualquiera de los dos CIERRA la compra.
  const uploadPaqueteConta = (purchase, fileObj, tipo = "paquete") => subirYEnlazar(purchase, fileObj, (orig, ref) => ({
    ...orig,
    conta: {
      ...(tipo === "factura" ? { facturaFile: ref } : ref),
      tipo, cerradoPor: userName, cerradoAt: new Date().toISOString(),
    },
    audit: [...(orig.audit || []), { action: "cierre_contable", by: userName || userRole, role: userRole, at: new Date().toISOString(), note: `Cerrada contablemente — ${tipo === "factura" ? "factura escaneada" : "paquete digitalizado"}: ${ref.name}` }],
  }));
  const reabrirCierreConta = async (purchase) => {
    if (!confirm(`¿REABRIR el cierre contable de ${purchase.provider} — ${purchase.description}?`)) return false;
    let cloud;
    try { cloud = await store.getCloud("mq-purchases"); }
    catch { alert("⚠️ Sin conexión — no se reabrió."); return false; }
    const idx = (cloud || []).findIndex(x => x.id === purchase.id);
    if (idx === -1) { alert("⚠️ No se encontró la solicitud."); return false; }
    const next = [...cloud];
    next[idx] = { ...cloud[idx], conta: null, contaAnterior: cloud[idx].conta || null, audit: [...(cloud[idx].audit || []), { action: "cierre_contable_reabierto", by: userName || userRole, role: userRole, at: new Date().toISOString(), note: "Cierre contable reabierto" }] };
    const ok = await store.set("mq-purchases", next);
    if (ok) setPurchases(next); else alert("⚠️ No se sincronizó — reintentá.");
    return ok;
  };
  // ── PAQUETE DE CIERRE CONTABLE (19-ago-2026) ─────────────────────────────
  // UN solo PDF descargable con TODO adentro: portada con logo + checklist de
  // Contabilidad, y a continuación los documentos anexos (PDFs mergeados con
  // pdf-lib, imágenes embebidas a página). Antes era una página HTML que solo
  // listaba los PDFs "imprimilos aparte" — conta necesita el paquete completo
  // de una para engrapar la factura física y archivarlo.
  //
  // Checklist que exige conta: ficha de recibido (si aplica), comprobante de
  // pago, cotización, constancia de pagos a cuenta del proveedor y factura.
  const imprimirPaqueteConta = async (pr) => {
    const pu = pr;
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
      fs(7.5, "bold"); tc(ORANGE); doc.text("GRUPO GEOTECNICA · GEOMACHINERY", xTxt, y + 4);
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
      const maquina = machines.find(m => m.id === pu.machineId);
      if (maquina) filas.push(["Máquina", maquina.nombre]);
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
      if (pu.detalleMateriales) {
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
      doc.text("GeoMachinery — Sistema de Operaciones · Grupo Geotecnica", M, PH - 10);
      doc.text("Preparado por " + (userName || "Operaciones"), PW - M, PH - 10, { align: "right" });

      // ── ANEXOS ──
      const anexos = [
        ["FICHA DE RECIBIDO FIRMADA", ficha],
        ["COMPROBANTE DE PAGO", comp],
        ["COTIZACIÓN", quote],
        ["CONSTANCIA DE PAGOS A CUENTA", constancia],
        ["FACTURA DEL PROVEEDOR", factura],
      ].filter(([, f]) => !!f);

      // Imágenes → página propia con encabezado
      anexos.filter(([, f]) => String(f.type || "").startsWith("image/")).forEach(([titulo, f]) => {
        doc.addPage();
        fs(10, "bold"); tc(ORANGE); doc.text(titulo, PW / 2, 14, { align: "center" });
        fs(7.5, "normal"); tc(GRAY); doc.text(String(pu.codigo || "") + " · " + (pu.provider || ""), PW / 2, 19, { align: "center" });
        doc.setDrawColor(232, 118, 45); doc.setLineWidth(0.4); doc.line(M, 22, PW - M, 22);
        try { doc.addImage(f.dataUrl, String(f.type).includes("png") ? "PNG" : "JPEG", M, 26, PW - 2 * M, PH - 42, undefined, "FAST"); }
        catch { fs(9, "normal"); tc(GRAY); doc.text("(imagen no incrustable)", PW / 2, PH / 2, { align: "center" }); }
      });

      const pdfAnexos = anexos.filter(([, f]) => String(f.type || "") === "application/pdf");
      const fileName = `PAQUETE-${String(pu.codigo || pu.id).replace(/[^A-Za-z0-9-]/g, "")}.pdf`;
      if (!pdfAnexos.length) { doc.save(fileName); return; }

      // PDFs → mergear de verdad con pdf-lib
      const { PDFDocument } = await safeDynamicImport(() => import("pdf-lib"), "pdf-lib");
      const out = await PDFDocument.load(doc.output("arraybuffer"));
      const fallidos = [];
      for (const [titulo, f] of pdfAnexos) {
        try {
          const b64 = String(f.dataUrl).split(",")[1];
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const inDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
          const pages = await out.copyPages(inDoc, inDoc.getPageIndices());
          pages.forEach(pg => out.addPage(pg));
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
  const removePurchase = (id) => sP(purchases.filter(p => p.id !== id));

  // ── MIGRACIÓN: asignar código a las solicitudes viejas (19-ago-2026) ──
  // Solo admin. Numera por orden de CREACIÓN (createdAt) dentro de cada año,
  // respetando los códigos que ya existan. getCloud + verify, como todo lo
  // que reescribe el array completo.
  const asignarCodigosFaltantes = async () => {
    const sinCodigo = purchases.filter(p => p && !p.codigo);
    if (!sinCodigo.length) return alert("Todas las solicitudes ya tienen código. ✔");
    if (!confirm(`¿Asignar código a ${sinCodigo.length} solicitud(es) sin código?\n\nSe numeran por fecha de creación con el formato MAQ-AÑO-0000. Las que ya tienen código NO se tocan.`)) return;
    let cloud;
    try { cloud = await store.getCloud("mq-purchases"); }
    catch { return alert("⚠️ Sin conexión con la nube — no se asignó nada. Reintentá."); }
    if (!Array.isArray(cloud)) return alert("⚠️ No se pudo leer la lista desde la nube.");
    const contadores = {};
    cloud.forEach(p => {
      const m = /^MAQ-(\d{4})-(\d+)$/.exec(String(p?.codigo || ""));
      if (m) { const y = m[1], n = parseInt(m[2], 10); contadores[y] = Math.max(contadores[y] || 0, n); }
    });
    const orden = cloud.map((p, i) => ({ p, i })).filter(x => x.p && !x.p.codigo)
      .sort((a, b) => String(a.p.createdAt || "").localeCompare(String(b.p.createdAt || "")) || a.i - b.i);
    const next = [...cloud];
    orden.forEach(({ p, i }) => {
      const y = String(p.createdAt || new Date().toISOString()).slice(0, 4);
      contadores[y] = (contadores[y] || 0) + 1;
      next[i] = { ...p, codigo: `MAQ-${y}-${String(contadores[y]).padStart(4, "0")}` };
    });
    const ok = await store.set("mq-purchases", next);
    let verified = false;
    try { const back = await store.getCloud("mq-purchases"); verified = Array.isArray(back) && back.filter(p => p && !p.codigo).length === 0; } catch { verified = false; }
    if (!ok || !verified) return alert("⚠️ No se pudo VERIFICAR la asignación en la nube — reintentá.");
    setPurchases(next);
    alert(`✅ Listo: ${orden.length} solicitud(es) numeradas.`);
  };
  // Helper: guarda y retorna true/false segun exito. Para los botones que
  // quieren cerrar el modal solo si el guardado fue exitoso.
  const saveOrAlert = async (newPurchases) => {
    const ok = await sP(newPurchases);
    return ok;
  };

  const cc = COMPANIES[co];

  // ── Filtros aplicados ──
  const filtered = cp.filter(p => {
    if (filter.status && p.status !== filter.status) return false;
    if (filter.project && p.projectCode !== filter.project) return false;
    if (filter.provider && !(p.provider || "").toLowerCase().includes(filter.provider.toLowerCase())) return false;
    if (filter.from && p.createdAt && new Date(p.createdAt) < new Date(filter.from)) return false;
    if (filter.to && p.createdAt && new Date(p.createdAt) > new Date(filter.to + "T23:59:59")) return false;
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
    montoPagadoMes: cp.filter(p => (p.status === "pagado" || p.status === "finalizado") && p.paidAt && new Date(p.paidAt).getMonth() === new Date().getMonth() && new Date(p.paidAt).getFullYear() === new Date().getFullYear()).reduce((s, p) => s + (Number(p.amount) || 0), 0),
    sinRecibido: cp.filter(p => (p.status === "pagado" || p.status === "finalizado") && p.deliveryStatus !== "cerrado").length,
  };

  if (!loaded) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'Segoe UI', sans-serif", color: "#64748b" }}>Cargando Maquinas - Solicitudes de pago...</div>;

  // PurchaseFormImpl y PaymentFormImpl viven a nivel de modulo (final del archivo).
  // NO definir aqui — la identidad del componente cambiaria en cada render del padre
  // y React desmontaria los inputs, perdiendo el focus al tipear.

  // ── VISTA DETALLE ──
  const DetailView = ({ purchase }) => {
    const [p, setP] = useState(purchase);
    const s = STATUSES[p.status] || STATUSES.borrador;

    // Recepcion de Materiales — REINTEGRADA (pedido 23-jul-2026): Maquinas
    // ahora tiene el mismo flujo de logistica + fichas que GeoShopping.
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
      const rec = {
        ...p,
        deliveryStatus: newStatus || p.deliveryStatus || "pendiente_entrega",
        delivery: { ...newDf, updatedAt: new Date().toISOString() },
      };
      const labels = {
        recibido: "Materiales marcados como recibidos",
        ficha_adjunta: "Ficha de recibido adjuntada",
        cerrado: "Solicitud cerrada",
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
          <div><div style={{ fontSize: 11, color: "#64748b" }}>Fecha de carga</div><div style={{ fontWeight: 600 }}>{fmt(p.createdAt)}</div></div>
          <div><div style={{ fontSize: 11, color: "#64748b" }}>Proveedor</div><div style={{ fontWeight: 600 }}>{p.provider}</div></div>
          <div><div style={{ fontSize: 11, color: "#64748b" }}>N° Cotizacion</div><div style={{ fontWeight: 600 }}>{p.quoteNumber || "—"}</div></div>
          <div><div style={{ fontSize: 11, color: "#64748b" }}>Responsable Ops</div><div style={{ fontWeight: 600 }}>{p.opsResponsible || "—"}</div></div>
          <div><div style={{ fontSize: 11, color: "#64748b" }}>Validado</div><div style={{ fontWeight: 600 }}>{fmtDT(p.validatedAt)}</div></div>
          {p.machineId && (() => {
            const linkedMachine = machines.find(mm => mm.id === p.machineId);
            if (!linkedMachine) return null;
            return <div style={{ gridColumn: "1/-1" }}>
              <div style={{ fontSize: 11, color: "#64748b" }}>Maquina vinculada</div>
              <div style={{ fontWeight: 600 }}>
                {linkedMachine.tipo === "compresor" ? "💨 Compresor" : "⚙️ Maquina"} — {linkedMachine.nombre}
                {linkedMachine.diametroTipo && <span style={{ color: "#64748b", fontWeight: 500 }}> · diametro {linkedMachine.diametroTipo}</span>}
              </div>
            </div>;
          })()}
          <div style={{ gridColumn: "1/-1" }}>
            <div style={{ fontSize: 11, color: "#64748b" }}>Descripcion</div>
            <div style={{ fontWeight: 500, lineHeight: 1.5 }}>{p.description}</div>
          </div>
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
          file={getProject(p.projectCode)?.costsRequestFile}
          canUpload={false}
          accent="#7C3AED"
          onUpload={() => {}}
          onRemove={() => {}}
        />
        <FileSlot
          label="📄 Cotizacion del proveedor"
          file={p.quoteFile}
          canUpload={canEditOps}
          accent="#2563EB"
          onUpload={setQuoteFile}
          onRemove={removeQuoteFile}
        />
        <div>
          <FileSlot
            label="🧾 Comprobante de transferencia"
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

      {/* ═══ Recepcion de Materiales (mismo flujo que GeoShopping) ═══ */}
      {(p.status === "pagado" || p.status === "finalizado") && (() => {
        const ds = DELIVERY_STATUSES[p.deliveryStatus] || DELIVERY_STATUSES.pendiente_entrega;
        const isClosed = p.deliveryStatus === "cerrado";
        const canEditDlv = canEditDelivery && !isClosed;

        return <div style={{ border: `2px solid ${ds.color}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ background: ds.bg, padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>{ds.icon}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: ds.color, textTransform: "uppercase", letterSpacing: 0.4 }}>Recepcion de Materiales</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: ds.color }}>{ds.label}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {p.deliveryStatus === "pendiente_entrega" && <div style={{ background: "#FEF3C7", border: "1px solid #F59E0B", borderRadius: 8, padding: "6px 12px", fontSize: 12, color: "#92400E", fontWeight: 600 }}>
                ⚠️ Pagada — pendiente coordinar entrega o cerrar
              </div>}
              <Btn small variant="info" onClick={async () => { await generateFichaPDF(p, getProject(p.projectCode), COMPANIES[p.company]?.name); }}>📥 Descargar Ficha PDF</Btn>
              {canEditDlv && !dlvEdit && <Btn small variant="info" onClick={() => setDlvEdit(true)}>✏️ Editar recepcion</Btn>}
            </div>
          </div>

          <div style={{ background: "#fff", padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            {dlvEdit && canEditDlv ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                  <Input label="Fecha esperada de entrega" type="date" value={df.expectedDate} onChange={e => ud("expectedDate", e.target.value)} />
                  <Input label="Fecha real de entrega" type="date" value={df.actualDate} onChange={e => ud("actualDate", e.target.value)} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <Input label="Nombre de quien recibio" value={df.receivedBy} onChange={e => ud("receivedBy", e.target.value)} placeholder="Nombre completo" />
                  <Input label="Cargo de quien recibio" value={df.receivedByRole} onChange={e => ud("receivedByRole", e.target.value)} placeholder="Cargo en el proyecto" />
                </div>
                <Textarea label="Observaciones de recepcion" value={df.observations} onChange={e => ud("observations", e.target.value)} placeholder="Estado de los repuestos/materiales, faltantes, incidencias, etc." />
                <Textarea label="Notas de cierre" value={df.closingNotes} onChange={e => ud("closingNotes", e.target.value)} placeholder="Notas finales, conformidad, observaciones para el expediente..." />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <Btn variant="ghost" onClick={() => setDlvEdit(false)}>Cancelar</Btn>
                  <Btn variant="warn" onClick={() => saveDelivery(df, df.actualDate ? "recibido" : "pendiente_entrega")}>💾 Guardar</Btn>
                  {df.actualDate && df.receivedBy && <Btn variant="success" onClick={() => saveDelivery(df, "recibido")}>✅ Marcar recibido</Btn>}
                  <Btn variant="danger" onClick={() => {
                    if (!confirm("¿Cerrar esta solicitud SIN enviar a logística?\n\nUsalo cuando no aplica retiro (servicio en sitio, lo recogió Fernando, etc.). No se podrá editar la recepción después.")) return;
                    saveDelivery({ ...df, closingNotes: df.closingNotes || "Cerrada sin logística" }, "cerrado");
                  }}>🔒 Cerrar sin logística</Btn>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, fontSize: 13 }}>
                  <div><div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>Fecha esperada</div><div style={{ fontWeight: 600 }}>{fmt(p.delivery?.expectedDate) || "—"}</div></div>
                  <div><div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>Fecha real de entrega</div><div style={{ fontWeight: 600 }}>{fmt(p.delivery?.actualDate) || "—"}</div></div>
                  <div><div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>Recibido por</div><div style={{ fontWeight: 600 }}>{p.delivery?.receivedBy || "—"}</div></div>
                </div>
                {p.delivery?.observations && <div style={{ background: "#F8FAFC", borderRadius: 8, padding: 10, fontSize: 13, color: "#334155" }}>
                  <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Observaciones</div>
                  {p.delivery.observations}
                </div>}
                {p.delivery?.closingNotes && <div style={{ background: "#F0FDF4", borderRadius: 8, padding: 10, fontSize: 13, color: "#065F46", border: "1px solid #BBF7D0" }}>
                  <div style={{ fontSize: 10, color: "#047857", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Notas de cierre</div>
                  {p.delivery.closingNotes}
                </div>}
                {isClosed && <div style={{ background: "#DCFCE7", border: "2px solid #059669", borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, fontWeight: 700, color: "#065F46", fontSize: 14 }}>
                  🔒 Solicitud cerrada{p.delivery?.closingNotes === "Cerrada sin logística" ? " — sin logística" : ""} — ciclo completado
                </div>}
              </div>
            )}

            {/* Ficha adjunta (PDF/imagen firmada) */}
            <FileSlot
              label="📋 Ficha de recibido (PDF firmado)"
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
      };
    });

    // Totales por empresa seleccionada
    const empresa = {
      total: projectStats.reduce((s, p) => s + p.total, 0),
      pending: projectStats.reduce((s, p) => s + p.pendingAmt, 0),
      paid: projectStats.reduce((s, p) => s + p.paidAmt, 0),
      count: projectStats.reduce((s, p) => s + p.count, 0),
    };

    const uploadCostsFile = async (short, fd) => {
      upsertProjectMeta(short, { costsRequestFile: fd });
    };
    const removeCostsFile = (short) => {
      if (!confirm("¿Eliminar el archivo de solicitud de Costos de este proyecto?")) return;
      upsertProjectMeta(short, { costsRequestFile: null });
    };

    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, color: "#64748b" }}>Dashboard por proyecto — {cc.name}</div>
          <div style={{ fontSize: 13, color: "#94A3B8" }}>{allProjects.length} proyectos · {empresa.count} solicitudes · total movido {fmtL(empresa.total)}</div>
        </div>
        {canCreate && <Btn variant="primary" onClick={() => setModal({ t: "new-project" })}>+ Nuevo proyecto</Btn>}
      </div>

      {/* Totales rapidos */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <StatCard icon="🏗️" label="Proyectos activos" value={projectStats.filter(p => p.count > 0).length} color="#BE185D" />
        <StatCard icon="📋" label="Total solicitudes" value={empresa.count} color="#2563EB" />
        <StatCard icon="⏳" label="Por pagar" value={fmtL(empresa.pending)} color="#D97706" />
        <StatCard icon="✅" label="Ya pagado" value={fmtL(empresa.paid)} color="#059669" />
      </div>

      {/* Cards por proyecto */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
        {projectStats.map(({ project, count, total, pendingAmt, paidAmt, pendingCount, paidCount, draftCount, finalizedCount }) => {
          const ref = { current: null };
          return <div key={project.short} style={{ background: "#fff", border: "1px solid #E2E8F0", borderLeft: `4px solid ${cc.color}`, borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 800, fontSize: 16, color: cc.color }}>{project.short}</span>
                  {project.isCustom && <Badge color="#BE185D">NUEVO</Badge>}
                  {!project.code && <Badge color="#D97706">SIN CODIGO</Badge>}
                </div>
                <div style={{ fontSize: 13, color: "#334155", marginTop: 2 }}>{project.name}</div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2, fontFamily: "monospace" }}>{project.code || "codigo contable pendiente"}</div>
              </div>
              {canCreate && <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => setModal({ t: "edit-project", d: project })} title="Editar proyecto" style={{ background: "none", border: "1px solid #E2E8F0", borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: "pointer", color: "#64748b" }}>✏️</button>
                <button onClick={() => deleteProject(project.short)} title={count > 0 ? `No se puede borrar: tiene ${count} solicitud(es)` : "Eliminar proyecto"} disabled={count > 0} style={{ background: "none", border: "1px solid #FECACA", borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: count > 0 ? "not-allowed" : "pointer", color: count > 0 ? "#CBD5E1" : "#DC2626", opacity: count > 0 ? 0.5 : 1 }}>🗑</button>
              </div>}
            </div>

            {/* Stats del proyecto */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
              <div style={{ background: "#F1F5F9", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ color: "#64748b", fontSize: 10, fontWeight: 600 }}>SOLICITUDES</div>
                <div style={{ fontWeight: 700, fontSize: 18, color: "#1E293B" }}>{count}</div>
              </div>
              <div style={{ background: "#ECFDF5", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ color: "#047857", fontSize: 10, fontWeight: 600 }}>TOTAL</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#059669" }}>{fmtL(total)}</div>
              </div>
              <div style={{ background: "#FEF3C7", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ color: "#92400E", fontSize: 10, fontWeight: 600 }}>PENDIENTE ({pendingCount})</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#D97706" }}>{fmtL(pendingAmt)}</div>
              </div>
              <div style={{ background: "#DBEAFE", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ color: "#1E40AF", fontSize: 10, fontWeight: 600 }}>PAGADO ({paidCount})</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#2563EB" }}>{fmtL(paidAmt)}</div>
              </div>
            </div>

            {/* Barra de estados */}
            {count > 0 && <div style={{ display: "flex", height: 6, borderRadius: 10, overflow: "hidden", background: "#F1F5F9" }}>
              {draftCount > 0 && <div style={{ flex: draftCount, background: "#94A3B8" }} title={`${draftCount} borradores`} />}
              {pendingCount > 0 && <div style={{ flex: pendingCount, background: "#D97706" }} title={`${pendingCount} pendientes de pago`} />}
              {(paidCount - finalizedCount) > 0 && <div style={{ flex: paidCount - finalizedCount, background: "#2563EB" }} title={`${paidCount - finalizedCount} pagados sin comprobante`} />}
              {finalizedCount > 0 && <div style={{ flex: finalizedCount, background: "#059669" }} title={`${finalizedCount} finalizados`} />}
            </div>}

            {/* Solicitud de Costos */}
            <div style={{ borderTop: "1px dashed #E2E8F0", paddingTop: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#7C3AED", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>📐 Solicitud original (Costos / Ingenieria)</div>
              {project.costsRequestFile ? <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, wordBreak: "break-all" }}>📎 {project.costsRequestFile.name}</div>
                  <div style={{ fontSize: 10, color: "#64748b" }}>{fmtMB(project.costsRequestFile.size)}</div>
                </div>
                <Btn small variant="info" onClick={() => {
                  const f = project.costsRequestFile;
                  if (f.type?.startsWith("image/") || f.type === "application/pdf") {
                    const w = window.open();
                    if (w) w.document.write(`<html><body style='margin:0;background:#222'>${f.type === "application/pdf" ? `<iframe src='${f.dataUrl}' style='width:100vw;height:100vh;border:none'></iframe>` : `<img src='${f.dataUrl}' style='max-width:100vw;max-height:100vh;display:block;margin:auto'/>`}</body></html>`);
                  } else {
                    const a = document.createElement("a"); a.href = f.dataUrl; a.download = f.name; a.click();
                  }
                }}>Ver</Btn>
                {canCreate && <Btn small variant="danger" onClick={() => removeCostsFile(project.short)}>×</Btn>}
              </div> : <div style={{ fontSize: 12, color: "#94A3B8", fontStyle: "italic" }}>Sin archivo adjunto</div>}
              {canCreate && <div style={{ marginTop: 6 }}>
                <input type="file" accept=".pdf,image/*,.xls,.xlsx,.doc,.docx" style={{ display: "none" }} id={`costs-${project.short}`} onChange={async (e) => {
                  const file = e.target.files?.[0]; if (!file) return;
                  if (file.size > 2 * 1024 * 1024) {
                    alert(`❌ ${fmtMB(file.size)}. Maximo 2 MB. Reduci el PDF en https://smallpdf.com/compress-pdf`);
                    e.target.value = ""; return;
                  }
                  if (file.size > 1 * 1024 * 1024 && !confirm(`⚠️ ${fmtMB(file.size)}. ¿Continuar?`)) { e.target.value = ""; return; }
                  const fd = await readFileAsDataUrl(file);
                  uploadCostsFile(project.short, fd);
                  e.target.value = "";
                }} />
                <Btn small variant="ghost" onClick={() => document.getElementById(`costs-${project.short}`).click()}>
                  {project.costsRequestFile ? "Reemplazar archivo" : "+ Subir solicitud de Costos"}
                </Btn>
              </div>}
            </div>

            {/* Ver solicitudes del proyecto */}
            {count > 0 && <Btn small variant="ghost" onClick={() => { setFilter(s => ({ ...s, project: project.short })); setSec("list"); }}>Ver {count} solicitud{count === 1 ? "" : "es"} →</Btn>}
          </div>;
        })}
      </div>
    </div>;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // PROVEEDORES — CRUD compartido entre admin/costos/Ana
  // ─────────────────────────────────────────────────────────────────────────
  const renderProviders = () => {
    const sorted = providers.slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "#EFF6FF", border: "1px solid #93C5FD", borderRadius: 10, padding: 14, fontSize: 13, color: "#1E40AF" }}>
        🏢 <b>{providers.length} proveedores registrados.</b> Cada solicitud que se crea con un proveedor nuevo se agrega aqui automaticamente para completar los datos (telefonos, cuentas bancarias, contacto). En la nueva solicitud aparecen como dropdown.
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "#64748b" }}>
          {providers.filter(p => p.autoImported && !p.phones?.length && !p.bankAccounts?.length).length} sin datos completos
        </span>
        {canManageProviders && <Btn variant="primary" onClick={() => setModal({ t: "provider-new" })}>+ Agregar proveedor</Btn>}
      </div>
      {sorted.length === 0
        ? <div style={{ background: "#F8FAFC", border: "1px dashed #CBD5E1", borderRadius: 12, padding: 40, textAlign: "center", color: "#94A3B8" }}>
            Aun no hay proveedores. Click en + Agregar proveedor.
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
  // COMMAND CENTER — Resumen end-to-end por proyecto
  // ─────────────────────────────────────────────────────────────────────────
  // Vista para admin/gerencia/costos/coordinador_maquinas. Cada solicitud muestra
  // su lifecycle (validacion → pago → comprobante) con la PROXIMA ACCION PENDIENTE
  // destacada. No hay flujo de logistica en Maquinas — el ciclo cierra cuando
  // Tesoreria sube el comprobante.
  // Lifecycle completo — mismo flujo que GeoShopping (pedido 23-jul-2026):
  // validacion → pago → comprobante → coordinacion (Fernando) → logistica →
  // entrega → ficha de recibido (Jorge). Tambien contempla el cierre SIN
  // logistica (deliveryStatus "cerrado" via boton en Por coordinar).
  const computeLifecycle = (p) => {
    const desp = despachos.find(d => d.sourcePurchaseId === p.id);
    const isPaid = p.status === "pagado" || p.status === "finalizado";
    const hasReceipt = !!p.receiptFile;
    const hasDesp = !!desp;
    const enRuta = desp?.estado === "en_ruta";
    const cerradoSinLog = p.deliveryStatus === "cerrado";
    const entregado = desp?.estado === "entregado" || p.deliveryStatus === "ficha_adjunta" || cerradoSinLog || p.deliveryStatus === "recibido";
    const fichaUploaded = !!p.delivery?.fichaFile;
    const lista = fichaUploaded || cerradoSinLog;

    // Estado y "siguiente accion" en lenguaje claro
    let nextAction = "";
    let nextOwner = "";
    if (p.status === "borrador") { nextAction = "Aprobar para enviar a Tesoreria"; nextOwner = "Coord. Maquinas"; }
    else if (p.status === "validado") { nextAction = "Registrar pago"; nextOwner = "Lic. Carolina"; }
    else if (isPaid && !hasReceipt) { nextAction = "Subir comprobante"; nextOwner = "Lic. Carolina"; }
    else if (isPaid && hasReceipt && !hasDesp && !lista) { nextAction = "Coordinar con proveedor: enviar a logistica o cerrar"; nextOwner = "Lic. Fernando"; }
    else if (hasDesp && !entregado && !enRuta) { nextAction = "Programar recogida (vehiculo + motorista)"; nextOwner = "Oscar Paz"; }
    else if (enRuta) { nextAction = "Entregar en proyecto"; nextOwner = "Motorista"; }
    else if (entregado && !fichaUploaded && !cerradoSinLog) { nextAction = "Entregado — pendiente subir ficha de recibido firmada"; nextOwner = "Jorge Castellanos"; }
    else if (cerradoSinLog && !fichaUploaded) { nextAction = "✓ Cerrada sin logistica"; nextOwner = ""; }
    else if (fichaUploaded) { nextAction = "✓ Lista — pasar a contabilidad"; nextOwner = ""; }

    return {
      desp, isPaid, hasReceipt, hasDesp, enRuta, entregado, fichaUploaded, cerradoSinLog, lista,
      nextAction, nextOwner,
    };
  };

  // Render de la barra de fases (7 hitos) para una solicitud de pago.
  const renderLifecycleBar = (p, lc) => {
    const phases = [
      { key: "solicitud", emoji: "📝", label: "Solicitud",   done: true },
      { key: "validado",  emoji: "✅", label: "Validada",    done: ["validado","pagado","finalizado"].includes(p.status) },
      { key: "pagado",    emoji: "💰", label: "Pagada",      done: lc.isPaid },
      { key: "compr",     emoji: "🧾", label: "Comprobante", done: lc.hasReceipt },
      { key: "coord",     emoji: "📦", label: "Coordinada",  done: lc.hasDesp || lc.lista },
      { key: "entrega",   emoji: "🚚", label: "Entregada",   done: lc.entregado },
      { key: "ficha",     emoji: "📋", label: "Ficha",       done: lc.fichaUploaded || lc.cerradoSinLog },
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

  // ─────────────────────────────────────────────────────────────────────────
  // DASHBOARD GERENCIAL — misma estructura que GeoShopping (23-jul-2026)
  // ─────────────────────────────────────────────────────────────────────────
  const renderDashboard = () => {
    const now = Date.now();
    const hoy = new Date();
    const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
    const mesSel = dashMonth || mesActual;
    const mesSelLabel = (() => {
      const [y, m] = mesSel.split("-").map(Number);
      return new Date(y, m - 1, 1).toLocaleDateString("es-HN", { month: "long", year: "numeric" });
    })();

    const activas = cp.filter(p => p.deliveryStatus !== "cerrado");
    const validadas = cp.filter(p => p.status === "validado");
    const montoPorPagar = validadas.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const pagadoMes = cp
      .filter(p => (p.status === "pagado" || p.status === "finalizado") && p.paidAt)
      .filter(p => String(p.paidAt).slice(0, 7) === mesSel)
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);

    const despachoOf = (p) => despachos.find(d => d.sourcePurchaseId === p.id);
    const isPaid = (p) => p.status === "pagado" || p.status === "finalizado";
    const cerradaOLista = (p) => p.delivery?.fichaFile || p.deliveryStatus === "cerrado" || p.deliveryStatus === "ficha_adjunta";

    const porCoordinar = cp.filter(p => isPaid(p) && !cerradaOLista(p) && !despachoOf(p));
    const pendienteEntrega = cp.filter(p => {
      if (!isPaid(p) || cerradaOLista(p)) return false;
      const d = despachoOf(p);
      return d && d.estado !== "entregado" && d.estado !== "cerrado";
    });
    const pendienteFicha = cp.filter(p => {
      if (p.delivery?.fichaFile || p.deliveryStatus === "cerrado") return false;
      const d = despachoOf(p);
      return isPaid(p) && (d?.estado === "entregado" || p.deliveryStatus === "recibido");
    });

    const kpis = [
      { icon: "📋", label: "Solicitudes activas",          value: activas.length,          color: "#2563EB", tint: "#DBEAFE", fmt: (v) => v },
      { icon: "💰", label: "Por pagar (Lic. Carolina)",    value: montoPorPagar,           color: "#D97706", tint: "#FEF3C7", fmt: (v) => fmtL(v) },
      { icon: "✅", label: `Pagado en ${mesSelLabel}`,      value: pagadoMes,               color: "#059669", tint: "#D1FAE5", fmt: (v) => fmtL(v) },
      { icon: "📦", label: "Por coordinar (Fernando)",     value: porCoordinar.length,     color: "#7C3AED", tint: "#EDE9FE", fmt: (v) => v },
      { icon: "🚛", label: "Pendiente entrega",            value: pendienteEntrega.length, color: "#B45309", tint: "#FDE68A", fmt: (v) => v },
      { icon: "📋", label: "Pendiente ficha",              value: pendienteFicha.length,   color: "#DC2626", tint: "#FEE2E2", fmt: (v) => v },
    ];

    // Dona: % del gasto del mes por proyecto (top 6 + otros)
    const DONUT_COLORS = ["#059669", "#2563EB", "#D97706", "#7C3AED", "#DC2626", "#0891B2", "#BE185D", "#65A30D"];
    const gastoMesProy = {};
    cp.forEach(p => {
      if (!isPaid(p) || String(p.paidAt || "").slice(0, 7) !== mesSel) return;
      const key = p.projectCode || "Sin proyecto";
      gastoMesProy[key] = (gastoMesProy[key] || 0) + (Number(p.amount) || 0);
    });
    const gastoSorted = Object.entries(gastoMesProy).sort((a, b) => b[1] - a[1]);
    const otrosGasto = gastoSorted.slice(6).reduce((s, [, v]) => s + v, 0);
    const donutCats = [
      ...gastoSorted.slice(0, 6).map(([k, v], i) => ({ key: k, label: k, count: v, color: DONUT_COLORS[i % DONUT_COLORS.length] })),
      ...(otrosGasto > 0 ? [{ key: "_otros", label: "Otros", count: otrosGasto, color: "#94A3B8" }] : []),
    ];
    const donutTotal = donutCats.reduce((s, c) => s + c.count, 0);
    const shortL = (v) => v >= 1e6 ? `L ${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `L ${Math.round(v / 1e3)}k` : `L ${Math.round(v)}`;
    const donutR = 60, donutInner = 42;
    const donutCircum = 2 * Math.PI * donutR;
    let accAngle = 0;
    const donutArcs = donutCats.map(c => {
      const frac = donutTotal > 0 ? c.count / donutTotal : 0;
      const dash = frac * donutCircum;
      const seg = { ...c, dash, gap: donutCircum - dash, rotation: accAngle };
      accAngle += frac * 360;
      return seg;
    });

    // Por proyecto: por pagar (Carolina) + pagado en el mes
    const proyRows = (() => {
      const acc = {};
      cp.forEach(p => {
        const key = p.projectCode || "_sin_proyecto";
        if (!acc[key]) acc[key] = { porPagar: 0, nPorPagar: 0, pagadoMes: 0 };
        if (p.status === "validado") { acc[key].porPagar += Number(p.amount) || 0; acc[key].nPorPagar++; }
        if (isPaid(p) && String(p.paidAt || "").slice(0, 7) === mesSel) acc[key].pagadoMes += Number(p.amount) || 0;
      });
      return Object.entries(acc).map(([key, v]) => ({ key, ...v }))
        .filter(r => r.porPagar > 0 || r.pagadoMes > 0)
        .sort((a, b) => b.porPagar - a.porPagar || b.pagadoMes - a.pagadoMes);
    })();
    const totPorPagarProy = proyRows.reduce((s, r) => s + r.porPagar, 0);
    const totPagadoMesProy = proyRows.reduce((s, r) => s + r.pagadoMes, 0);
    const maxPagadoMesProy = Math.max(1, ...proyRows.map(r => r.pagadoMes));

    // Suministro pendiente
    const daysSince = (iso) => !iso ? 0 : Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86400000));
    const alertaCoord = porCoordinar.map(p => ({ p, dias: daysSince(p.paidAt || p.createdAt) })).sort((a, b) => b.dias - a.dias);
    const alertaEntrega = pendienteEntrega.map(p => { const d = despachoOf(p); return { p, dias: daysSince(d?.createdAt || p.paidAt) }; }).sort((a, b) => b.dias - a.dias);
    const faltaProy = {};
    alertaCoord.forEach(({ p }) => { const k = p.projectCode || "—"; if (!faltaProy[k]) faltaProy[k] = { coord: 0, log: 0, monto: 0 }; faltaProy[k].coord++; faltaProy[k].monto += Number(p.amount) || 0; });
    alertaEntrega.forEach(({ p }) => { const k = p.projectCode || "—"; if (!faltaProy[k]) faltaProy[k] = { coord: 0, log: 0, monto: 0 }; faltaProy[k].log++; faltaProy[k].monto += Number(p.amount) || 0; });
    const faltaProyRows = Object.entries(faltaProy).map(([k, v]) => ({ key: k, ...v, total: v.coord + v.log })).sort((a, b) => b.total - a.total || b.monto - a.monto);

    // Gasto por MÁQUINA en el mes seleccionado (ago 2026, para el reporte
    // mensual de costos de Gerson — espejo del reporte de RRHH). Se cuenta
    // por fecha de PAGO (paidAt), igual que la dona por proyecto. Las
    // solicitudes sin máquina vinculada van en "Sin máquina asignada".
    const gastoMaq = (() => {
      const acc = {};
      cp.forEach(x => {
        if (!isPaid(x) || String(x.paidAt || "").slice(0, 7) !== mesSel) return;
        const k = x.machineId || "__sin__";
        if (!acc[k]) acc[k] = { monto: 0, n: 0, proys: {} };
        acc[k].monto += Number(x.amount) || 0;
        acc[k].n++;
        const pk = x.projectCode || "—";
        acc[k].proys[pk] = (acc[k].proys[pk] || 0) + (Number(x.amount) || 0);
      });
      return Object.entries(acc).map(([k, v]) => ({
        key: k,
        nombre: k === "__sin__" ? "Sin máquina asignada" : (machines.find(m => m.id === k)?.nombre || "Máquina eliminada"),
        ...v,
      })).sort((a, b) => b.monto - a.monto);
    })();
    const totGastoMaq = gastoMaq.reduce((sm, r) => sm + r.monto, 0);
    const maxGastoMaq = Math.max(1, ...gastoMaq.map(r => r.monto));
    const csvMaquinas = () => {
      const enc = (v) => { let t = String(v ?? ""); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
      const lines = [["Mes", "Maquina", "Solicitudes", "Gasto (L)", "Proyectos"].map(enc).join(",")];
      gastoMaq.forEach(r => lines.push([mesSel, r.nombre, r.n, r.monto.toFixed(2), Object.entries(r.proys).map(([pk, v]) => `${pk}: L ${v.toFixed(2)}`).join(" | ")].map(enc).join(",")));
      lines.push(["", "TOTAL", gastoMaq.reduce((sm, r) => sm + r.n, 0), totGastoMaq.toFixed(2), ""].map(enc).join(","));
      const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `gasto-maquinas-${mesSel}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    };

    const cardStyle = { background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(15,23,42,0.05)" };

    const AlertItem = ({ item, days_color }) => (
      <div onClick={() => setModal({ t: "detail", d: item.p })}
        style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1.4fr) minmax(0,1.6fr) auto auto", gap: 10, alignItems: "center", padding: "8px 10px", borderRadius: 8, background: "#F8FAFC", border: "1px solid #E2E8F0", cursor: "pointer", fontSize: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: CHARCOAL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.p.provider || "—"}</div>
          <div style={{ fontSize: 10, color: "#64748b", fontFamily: "ui-monospace, Menlo, monospace" }}>{item.p.projectCode || "—"}</div>
        </div>
        <div style={{ fontSize: 11, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.p.description || "Solicitud"}</div>
        <div style={{ fontWeight: 800, color: "#059669", fontSize: 12, whiteSpace: "nowrap" }}>{fmtL(item.p.amount)}</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: days_color, background: days_color + "18", padding: "3px 8px", borderRadius: 10, whiteSpace: "nowrap" }}>{item.dias}d</div>
      </div>
    );
    const AlertBlock = ({ icon, title, color, items, emptyMsg }) => (
      <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 22 }}>{icon}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: CHARCOAL, lineHeight: 1.2 }}>{title}</div>
              <div style={{ fontSize: 11, color: STONE, marginTop: 2 }}>{items.length} pendientes</div>
            </div>
          </div>
          <div style={{ background: color, color: "#fff", fontWeight: 800, fontSize: 14, width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>{items.length}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
          {items.length === 0 && <div style={{ fontSize: 12, color: "#94A3B8", fontStyle: "italic", padding: "12px 4px" }}>{emptyMsg}</div>}
          {items.slice(0, 5).map((it, i) => <AlertItem key={it.p.id || i} item={it} days_color={color} />)}
        </div>
        {items.length > 0 && <button onClick={() => setSec("coordinar")} style={{ marginTop: 4, background: "transparent", border: `1px solid ${color}`, color, padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", alignSelf: "flex-start" }}>Ver en Por coordinar →</button>}
      </div>
    );

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ background: `linear-gradient(135deg, #FFF7ED 0%, #FEF3E6 100%)`, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: isMobile ? 16 : 20, fontWeight: 800, color: CHARCOAL, letterSpacing: -0.3 }}>📊 Dashboard Gerencial — Maquinas</div>
            <div style={{ fontSize: 12, color: STONE, marginTop: 4 }}>Vista ejecutiva — repuestos y mantenimiento</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 11, color: STONE, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>
              {new Date().toLocaleDateString("es-HN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </div>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: STONE, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Mes de análisis</div>
              <input type="month" value={mesSel} onChange={e => setDashMonth(e.target.value)} style={{ padding: "6px 10px", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12, background: "#fff", fontFamily: "inherit" }} />
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0,1fr))" : `repeat(${kpis.length}, minmax(0,1fr))`, gap: 12 }}>
          {kpis.map(k => (
            <div key={k.label} style={{ ...cardStyle, padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: k.tint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{k.icon}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: isMobile ? 15 : 18, fontWeight: 800, color: k.color, lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis" }}>{k.fmt(k.value)}</div>
                <div style={{ fontSize: 10, color: STONE, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 3 }}>{k.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1.3fr", gap: 16 }}>
          {/* Dona: gasto del mes por proyecto */}
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 800, color: CHARCOAL, marginBottom: 12, letterSpacing: -0.2 }}>Gasto del mes por proyecto — {mesSelLabel}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
              <svg viewBox="0 0 160 160" style={{ width: 160, height: 160, flexShrink: 0 }}>
                <g transform="translate(80,80)">
                  <circle r={donutR} fill="none" stroke="#F1F5F9" strokeWidth={donutR - donutInner} />
                  {donutTotal > 0 && donutArcs.map(seg => (
                    <circle key={seg.key} r={donutR} fill="none" stroke={seg.color} strokeWidth={donutR - donutInner} strokeDasharray={`${seg.dash} ${seg.gap}`} transform={`rotate(${-90 + seg.rotation})`} />
                  ))}
                  <text textAnchor="middle" y="-4" style={{ fontSize: 15, fontWeight: 800, fill: CHARCOAL }}>{shortL(donutTotal)}</text>
                  <text textAnchor="middle" y="14" style={{ fontSize: 8, fill: STONE, letterSpacing: 0.5 }}>PAGADO {mesSelLabel.split(" ")[0].toUpperCase()}</text>
                </g>
              </svg>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 150, flex: 1 }}>
                {donutCats.length === 0 && <div style={{ fontSize: 12, color: "#94A3B8", fontStyle: "italic" }}>Sin pagos registrados en {mesSelLabel}.</div>}
                {donutCats.map(c => {
                  const pct = donutTotal > 0 ? Math.round((c.count / donutTotal) * 100) : 0;
                  return (
                    <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <div style={{ width: 12, height: 12, borderRadius: 3, background: c.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, color: CHARCOAL, fontWeight: 600, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</div>
                      <div style={{ fontWeight: 700, color: CHARCOAL, fontSize: 11, whiteSpace: "nowrap" }}>{fmtL(c.count)}</div>
                      <div style={{ color: c.color, fontWeight: 800, fontSize: 11, width: 38, textAlign: "right" }}>{pct}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Gasto del mes por MÁQUINA (ago 2026 — reporte mensual de costos) */}
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 800, color: CHARCOAL, marginBottom: 12, letterSpacing: -0.2, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span>⚙️ Gasto por máquina — {mesSelLabel}</span>
              {(canSeeCostosMaq || isVisorCompras) && <button onClick={csvMaquinas} disabled={gastoMaq.length === 0} style={{ background: "transparent", color: gastoMaq.length ? "#059669" : "#CBD5E1", border: `1px solid ${gastoMaq.length ? "#6EE7B7" : "#E2E8F0"}`, padding: "5px 10px", borderRadius: 6, fontSize: 10.5, fontWeight: 700, cursor: gastoMaq.length ? "pointer" : "default", fontFamily: "inherit" }}>📊 CSV</button>}
            </div>
            {gastoMaq.length === 0 ? (
              <div style={{ fontSize: 12, color: "#94A3B8", fontStyle: "italic", padding: "20px 4px" }}>Ningún pago de repuestos/mantenimiento en {mesSelLabel}.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {gastoMaq.map(r => (
                  <div key={r.key} style={{ borderBottom: "1px solid #F1F5F9", paddingBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div style={{ fontWeight: 800, color: r.key === "__sin__" ? "#B45309" : CHARCOAL, fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.key === "__sin__" ? "⚠ " : "⚙️ "}{r.nombre}</div>
                      <span style={{ fontSize: 10, color: STONE }}>({r.n})</span>
                      <span style={{ fontWeight: 800, color: "#059669", fontSize: 12, whiteSpace: "nowrap" }}>{fmtL(r.monto)}</span>
                    </div>
                    <div style={{ height: 7, borderRadius: 4, background: "#F1F5F9", overflow: "hidden", marginTop: 4 }}>
                      <div style={{ width: `${(r.monto / maxGastoMaq) * 100}%`, height: "100%", background: r.key === "__sin__" ? "#F59E0B" : "#7C3AED" }} />
                    </div>
                    <div style={{ fontSize: 10, color: STONE, marginTop: 3 }}>{Object.entries(r.proys).map(([pk, v]) => `${pk}: ${fmtL(v)}`).join(" · ")}</div>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 12.5, color: CHARCOAL, paddingTop: 4 }}>
                  <span>TOTAL DEL MES</span><span style={{ color: "#059669" }}>{fmtL(totGastoMaq)}</span>
                </div>
                {gastoMaq.some(r => r.key === "__sin__") && <div style={{ fontSize: 10.5, color: "#B45309", background: "#FEF3C7", borderRadius: 6, padding: "6px 10px" }}>⚠ Hay pagos sin máquina vinculada — asignales la máquina en la solicitud para que el reporte quede completo.</div>}
              </div>
            )}
          </div>

          {/* Por proyecto: por pagar + pagado del mes */}
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 800, color: CHARCOAL, marginBottom: 12, letterSpacing: -0.2, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span>Por proyecto</span>
              <span style={{ fontSize: 10, color: STONE, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>por pagar (Lic. Carolina) · pagado en {mesSelLabel}</span>
            </div>
            {proyRows.length === 0 ? (
              <div style={{ fontSize: 12, color: "#94A3B8", fontStyle: "italic", padding: "20px 4px" }}>Nada por pagar y ningún pago en {mesSelLabel}.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #E2E8F0" }}>
                      <th style={{ textAlign: "left", padding: "6px 6px", fontSize: 10, fontWeight: 700, color: STONE, textTransform: "uppercase" }}>Proyecto</th>
                      <th style={{ textAlign: "right", padding: "6px 6px", fontSize: 10, fontWeight: 700, color: "#D97706", textTransform: "uppercase" }}>Por pagar</th>
                      <th style={{ textAlign: "right", padding: "6px 6px", fontSize: 10, fontWeight: 700, color: "#059669", textTransform: "uppercase" }}>Pagado {mesSelLabel.split(" ")[0]}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proyRows.slice(0, 10).map(r => (
                      <tr key={r.key} style={{ borderBottom: "1px solid #F1F5F9" }}>
                        <td style={{ padding: "7px 6px", fontWeight: 700, color: CHARCOAL, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11 }}>{r.key}</td>
                        <td style={{ padding: "7px 6px", textAlign: "right", fontWeight: 700, color: r.porPagar > 0 ? "#D97706" : "#CBD5E1", whiteSpace: "nowrap" }}>
                          {r.porPagar > 0 ? <>{fmtL(r.porPagar)} <span style={{ fontSize: 9, color: STONE }}>({r.nPorPagar})</span></> : "—"}
                        </td>
                        <td style={{ padding: "7px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                            <div style={{ width: 46, height: 7, borderRadius: 4, background: "#F1F5F9", overflow: "hidden", flexShrink: 0 }}>
                              <div style={{ width: `${(r.pagadoMes / maxPagadoMesProy) * 100}%`, height: "100%", background: "#059669" }} />
                            </div>
                            <span style={{ fontWeight: 700, color: r.pagadoMes > 0 ? "#059669" : "#CBD5E1" }}>{r.pagadoMes > 0 ? fmtL(r.pagadoMes) : "—"}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid #CBD5E1" }}>
                      <td style={{ padding: "7px 6px", fontWeight: 800, color: CHARCOAL, fontSize: 11 }}>TOTAL</td>
                      <td style={{ padding: "7px 6px", textAlign: "right", fontWeight: 800, color: "#D97706", whiteSpace: "nowrap" }}>{fmtL(totPorPagarProy)}</td>
                      <td style={{ padding: "7px 6px", textAlign: "right", fontWeight: 800, color: "#059669", whiteSpace: "nowrap" }}>{fmtL(totPagadoMesProy)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* SUMINISTRO PENDIENTE */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: CHARCOAL, marginBottom: 10, letterSpacing: -0.2, textTransform: "uppercase" }}>
            🚚 Suministro pendiente — repuestos/material que falta entregar
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0,1fr))", gap: 14 }}>
            <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 22 }}>🏗️</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: CHARCOAL, lineHeight: 1.2 }}>Falta entregar por proyecto</div>
                  <div style={{ fontSize: 11, color: STONE, marginTop: 2 }}>pagadas aún sin entregar</div>
                </div>
              </div>
              {faltaProyRows.length === 0 ? (
                <div style={{ fontSize: 12, color: "#94A3B8", fontStyle: "italic", padding: "12px 4px" }}>✓ Todo entregado.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #E2E8F0" }}>
                      <th style={{ textAlign: "left", padding: "5px 4px", fontSize: 9, fontWeight: 700, color: STONE, textTransform: "uppercase" }}>Proyecto</th>
                      <th title="Fernando no ha coordinado" style={{ textAlign: "center", padding: "5px 4px", fontSize: 9, fontWeight: 700, color: "#7C3AED", textTransform: "uppercase" }}>Coord.</th>
                      <th title="En logistica, sin entregar" style={{ textAlign: "center", padding: "5px 4px", fontSize: 9, fontWeight: 700, color: "#2563EB", textTransform: "uppercase" }}>Logíst.</th>
                      <th style={{ textAlign: "right", padding: "5px 4px", fontSize: 9, fontWeight: 700, color: STONE, textTransform: "uppercase" }}>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faltaProyRows.slice(0, 8).map(r => (
                      <tr key={r.key} style={{ borderBottom: "1px solid #F1F5F9" }}>
                        <td style={{ padding: "6px 4px", fontWeight: 700, color: CHARCOAL, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 10 }}>{r.key}</td>
                        <td style={{ padding: "6px 4px", textAlign: "center", fontWeight: 800, color: r.coord > 0 ? "#7C3AED" : "#CBD5E1" }}>{r.coord || "—"}</td>
                        <td style={{ padding: "6px 4px", textAlign: "center", fontWeight: 800, color: r.log > 0 ? "#2563EB" : "#CBD5E1" }}>{r.log || "—"}</td>
                        <td style={{ padding: "6px 4px", textAlign: "right", fontWeight: 700, color: "#059669", whiteSpace: "nowrap" }}>{fmtL(r.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <AlertBlock icon="🕐" title="Sin coordinar (Fernando)" color="#7C3AED" items={alertaCoord} emptyMsg="✓ Todo coordinado — nada pendiente de enviar a logística o cerrar." />
            <AlertBlock icon="🚛" title="Logística no ha entregado" color="#2563EB" items={alertaEntrega} emptyMsg="✓ Logística al día — sin despachos pendientes." />
          </div>
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // POR COORDINAR — Kanban de solicitudes pagadas (mismo flujo que Ana en
  // GeoShopping): por_coordinar → en_logistica → listas. Fernando coordina
  // con el proveedor y envia a Logistica, O cierra sin logistica si no aplica.
  // ─────────────────────────────────────────────────────────────────────────
  const renderCoordinar = () => {
    const despachoDe = (purchaseId) => despachos.find(d => d.sourcePurchaseId === purchaseId);
    const clasificar = (p) => {
      if (p.status !== "pagado" && p.status !== "finalizado") return null;
      if (p.deliveryStatus === "ficha_adjunta" || p.deliveryStatus === "cerrado") return "listas";
      if (p.deliveryStatus === "entrega_proveedor") return null; // vive en la pestaña Entregas de proveedor
      const d = despachoDe(p.id);
      if (d && (d.estado === "pendiente" || d.estado === "programado" || d.estado === "en_ruta" || d.estado === "entregado")) return "en_logistica";
      return "por_coordinar";
    };

    const grupos = {};
    const totales = { por_coordinar: 0, en_logistica: 0, listas: 0 };
    cp.forEach(p => {
      const bucket = clasificar(p);
      if (!bucket) return;
      const key = p.projectCode || "_sin_proyecto";
      if (!grupos[key]) grupos[key] = { por_coordinar: [], en_logistica: [], listas: [] };
      grupos[key][bucket].push(p);
      totales[bucket]++;
    });
    // Solo proyectos con algo POR COORDINAR — lo demás vive en las pestañas
    // "Entregas de proveedor" y "Por cerrar contable" (ago 2026, espejo de
    // GeoShopping): este tablero queda limpio, solo lo accionable por Fernando.
    const proyectos = Object.keys(grupos).filter(k => grupos[k].por_coordinar.length > 0).sort((a, b) => grupos[b].por_coordinar.length - grupos[a].por_coordinar.length);

    const cerrarSinLogistica = async (p) => {
      if (!confirm(`¿Cerrar "${p.provider} — ${(p.description || "").slice(0, 60)}" SIN enviar a logística?\n\nUsalo cuando no aplica retiro (servicio en sitio, lo recoge Fernando, etc.).`)) return;
      const rec = {
        ...p,
        deliveryStatus: "cerrado",
        delivery: { ...(p.delivery || {}), closingNotes: p.delivery?.closingNotes || "Cerrada sin logística", updatedAt: new Date().toISOString() },
      };
      const saved = addAudit(rec, "closed_no_logistics", "Cerrada sin envio a logistica");
      const ok = await updatePurchase(saved);
      if (!ok) alert("⚠️ Se cerro en este dispositivo pero NO se sincronizo a la nube. Reintenta.");
    };

    const Card = ({ p, bucket }) => {
      const d = despachoDe(p.id);
      return (
        <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div onClick={() => setModal({ t: "detail", d: p })} style={{ cursor: "pointer" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: CHARCOAL }}>{p.provider || "—"}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.description}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#059669" }}>{fmtL(p.amount)}</span>
              {bucket === "en_logistica" && d && <Badge color="#0891B2">{d.estado === "entregado" ? "Entregado — falta ficha" : `Logística: ${d.estado}`}</Badge>}
              {bucket === "listas" && <Badge color="#059669">{p.deliveryStatus === "cerrado" ? "Cerrada" : "Ficha subida"}</Badge>}
            </div>
          </div>
          {bucket === "por_coordinar" && canSendToLogistics && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button onClick={() => setModal({ t: "send-pickup", d: p })} style={{ flex: 1, background: "#7C3AED", color: "#fff", border: "none", padding: "8px 10px", borderRadius: 6, fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>🚛 Enviar a Logística</button>
              <button onClick={() => setModal({ t: "entrega-directa", d: p })} title="El proveedor la lleva directo — no hay que ir a traerla" style={{ flex: 1, background: "#0F766E", color: "#fff", border: "none", padding: "8px 10px", borderRadius: 6, fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>🏪 La entrega el proveedor</button>
              <button onClick={() => cerrarSinLogistica(p)} title="Cerrar sin enviar a logística (no aplica retiro)" style={{ background: "transparent", color: "#DC2626", border: "1px solid #FCA5A5", padding: "8px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>🔒 Cerrar sin logística</button>
            </div>
          )}
        </div>
      );
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { label: "Por coordinar", value: totales.por_coordinar, color: "#7C3AED", desc: "pagadas sin orden de recogida" },
            { label: "Entregas de proveedor →", value: cp.filter(x => (x.status === "pagado" || x.status === "finalizado") && x.deliveryStatus === "entrega_proveedor").length, color: "#0F766E", desc: "las lleva el proveedor — ver pestaña", sec: "entregas" },
            { label: "Por cerrar contable →", value: totales.en_logistica + totales.listas, color: "#B45309", desc: "en logística o con documentos listos", sec: "conta" },
          ].map(k => (
            <div key={k.label} onClick={() => k.sec && setSec(k.sec)} style={{ flex: 1, minWidth: 160, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 18px", cursor: k.sec ? "pointer" : "default" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: STONE, textTransform: "uppercase", letterSpacing: 0.4 }}>{k.label}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: k.color, marginTop: 4 }}>{k.value}</div>
              <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{k.desc}</div>
            </div>
          ))}
        </div>

        {proyectos.length === 0 && (
          <div style={{ textAlign: "center", padding: 50, color: "#94A3B8" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#475569" }}>Nada por coordinar — no hay solicitudes pagadas pendientes.</div>
          </div>
        )}

        {proyectos.map(key => {
          const g = grupos[key];
          const proj = allProjects.find(pr => pr.short === key);
          return (
            <details key={key} open={g.por_coordinar.length > 0 || g.en_logistica.length > 0} style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
              <summary style={{ padding: "12px 18px", background: (g.por_coordinar.length > 0 ? "#7C3AED" : g.en_logistica.length > 0 ? "#0891B2" : "#059669") + "15", cursor: "pointer", listStyle: "none", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <span style={{ fontWeight: 800, fontFamily: "ui-monospace, Menlo, monospace", color: CHARCOAL }}>{key}</span>
                  {proj?.name && <span style={{ fontSize: 11, color: "#64748b", marginLeft: 8 }}>{proj.name}</span>}
                </div>
                <div style={{ display: "flex", gap: 8, fontSize: 11, fontWeight: 700 }}>
                  {g.por_coordinar.length > 0 && <span style={{ color: "#7C3AED" }}>{g.por_coordinar.length} por coordinar</span>}
                </div>
              </summary>
              <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
                {[["por_coordinar", "🕐 Por coordinar", "#7C3AED"]].map(([bk, label, color]) => (
                  <div key={bk} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color, textTransform: "uppercase", letterSpacing: 0.4 }}>{label} ({g[bk].length})</div>
                    {g[bk].length === 0 && <div style={{ fontSize: 11, color: "#CBD5E1", fontStyle: "italic" }}>—</div>}
                    {g[bk].map(p => <Card key={p.id} p={p} bucket={bk} />)}
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // ENTREGAS DE PROVEEDOR + POR CERRAR CONTABLEMENTE (ago 2026) — espejo del
  // flujo de GeoShopping, para Fernando. Ver comentarios en PurchasesModule.
  // ─────────────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────
  // COSTOS DE MAQUINARIA (19-ago-2026) — reporte ejecutivo mensual estilo
  // GeoTeam: por PROYECTO y por MÁQUINA (cada máquina va asignada a un
  // proyecto). SOLO admin/gerencia/costos — Fernando no ve esta pestaña.
  // Mes por fecha de PAGO (paidAt), ambas empresas.
  // ─────────────────────────────────────────────────────────────────────────
  const datosCostosMes = (mesEjec) => {
    const delMes = purchases.filter(x => (x.status === "pagado" || x.status === "finalizado") && String(x.paidAt || "").slice(0, 7) === mesEjec);
    const proy = {}; const maq = {}; const porEmp = { geotecnica: { total: 0, n: 0 }, subterra: { total: 0, n: 0 } };
    delMes.forEach(x => {
      const amt = Number(x.amount) || 0;
      const pk = x.projectCode || "SIN PROYECTO";
      const mk = x.machineId || "__sin__";
      const co2 = x.company === "subterra" ? "subterra" : "geotecnica";
      if (!proy[pk]) proy[pk] = { short: pk, total: 0, n: 0, maqs: {} };
      proy[pk].total += amt; proy[pk].n++;
      if (!proy[pk].maqs[mk]) proy[pk].maqs[mk] = { total: 0, items: [] };
      proy[pk].maqs[mk].total += amt; proy[pk].maqs[mk].items.push(x);
      if (!maq[mk]) maq[mk] = { total: 0, n: 0 };
      maq[mk].total += amt; maq[mk].n++;
      porEmp[co2].total += amt; porEmp[co2].n++;
    });
    const nombreMaq = (mk) => mk === "__sin__" ? "Sin máquina asignada" : (machines.find(m => m.id === mk)?.nombre || "Máquina eliminada");
    return { delMes, proy, maq, porEmp, nombreMaq };
  };

  const exportMaquinasEjecutivoPDF = (mesEjec) => {
    if (!mesEjec) return alert("Elegí el mes del reporte.");
    const [yy, mmn] = mesEjec.split("-").map(Number);
    const mesNombreRaw = new Date(yy, mmn - 1, 1).toLocaleDateString("es-HN", { month: "long", year: "numeric" });
    const mesTitulo = mesNombreRaw.charAt(0).toUpperCase() + mesNombreRaw.slice(1);
    const fL = (n) => "L " + Number(n || 0).toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const TAG = { geotecnica: "GEO", subterra: "SUB" };
    const { delMes, proy, maq, porEmp, nombreMaq } = datosCostosMes(mesEjec);
    if (!delMes.length) return alert(`No hay pagos de maquinaria en ${mesTitulo}.`);
    const rowsProy = Object.values(proy).sort((a, b) => b.total - a.total);
    const rowsMaq = Object.entries(maq).map(([k, v]) => ({ key: k, nombre: nombreMaq(k), ...v })).sort((a, b) => b.total - a.total);
    const totalG = rowsProy.reduce((sm, r) => sm + r.total, 0);
    const w = window.open("", "_blank");
    if (!w) return alert("Permití pop-ups para generar el PDF.");
    const logoUrl = `${import.meta.env.BASE_URL}brand/logo-color.png`;
    const genFecha = new Date().toLocaleDateString("es-HN", { day: "numeric", month: "long", year: "numeric" });
    const PALETA = ["#7C3AED", "#E8762D", "#2C5F5D", "#3E6A99", "#B45309", "#0E7490", "#BE3455", "#15803D"];
    const top = rowsProy.slice(0, 8), otros = rowsProy.slice(8);
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
    const maxMaq = Math.max(...rowsMaq.map(r => r.total), 1);
    const barrasMaq = rowsMaq.slice(0, 12).map(r => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:10px">
      <span style="width:130px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0;color:${r.key === "__sin__" ? "#B45309" : "#1E293B"}">${esc(r.nombre)}</span>
      <div style="flex:1;height:16px;background:#F8FAFC;border-radius:4px;overflow:hidden">
        <div style="width:${Math.max(2, (r.total / maxMaq) * 100).toFixed(1)}%;height:100%;background:${r.key === "__sin__" ? "#F59E0B" : "#7C3AED"}"></div>
      </div>
      <span style="width:92px;text-align:right;font-weight:700;flex-shrink:0">${fL(r.total)}</span>
    </div>`).join("");
    const kpi = (label, val, color, sub) => `<div style="flex:1;min-width:130px;border:1px solid #E2E8F0;border-radius:10px;padding:11px 14px">
      <div style="font-size:8.5px;color:#64748b;text-transform:uppercase;letter-spacing:0.6px;font-weight:700">${label}</div>
      <div style="font-size:17px;font-weight:800;color:${color};margin-top:3px;letter-spacing:-0.3px">${val}</div>
      ${sub ? `<div style="font-size:9px;color:#94A3B8;margin-top:1px">${sub}</div>` : ""}
    </div>`;
    const chipCo = (c2) => `<span style="display:inline-block;background:${c2 === "subterra" ? "#2C5F5D" : "#E8762D"};color:#fff;border-radius:4px;padding:1px 6px;font-size:8px;font-weight:800;letter-spacing:0.5px;vertical-align:1px">${TAG[c2] || "GEO"}</span>`;
    const projBlocks = rowsProy.map(r => {
      const maqsOrd = Object.entries(r.maqs).map(([mk, v]) => ({ mk, nombre: nombreMaq(mk), ...v })).sort((a, b) => b.total - a.total);
      return `
    <div style="margin-bottom:16px;border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;page-break-inside:avoid">
      <div style="background:#2C2A28;color:#fff;padding:8px 14px;font-weight:700;font-size:12.5px;display:flex;justify-content:space-between;align-items:center">
        <span>${esc(r.short)}</span>
        <span style="font-size:10px;font-weight:600;opacity:.85">${maqsOrd.length} máquina${maqsOrd.length !== 1 ? "s" : ""} · ${r.n} pago${r.n !== 1 ? "s" : ""} &nbsp;<span style="font-size:13px;font-weight:800;opacity:1">${fL(r.total)}</span></span>
      </div>
      ${maqsOrd.map(mq2 => `
        <div style="background:#F3E8FF;padding:6px 14px;font-size:11px;font-weight:800;color:#5B21B6;display:flex;justify-content:space-between;border-top:1px solid #E9D5FF">
          <span>⚙ ${esc(mq2.nombre)}</span><span>${fL(mq2.total)}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:10.5px">
          <tbody>
            ${mq2.items.map(x => `<tr style="border-top:1px solid #F1F5F9;vertical-align:top">
              <td style="padding:5px 14px;font-weight:600;white-space:nowrap;width:190px">${chipCo(x.company === "subterra" ? "subterra" : "geotecnica")} ${esc(x.provider || "—")}</td>
              <td style="padding:5px 8px;color:#334155">${esc(x.description || "—")}${x.detalleMateriales ? `<div style="color:#64748b;font-size:9px;white-space:pre-wrap;margin-top:2px;border-left:2px solid #E2E8F0;padding-left:6px">${esc(x.detalleMateriales)}</div>` : ""}</td>
              <td style="padding:5px 8px;text-align:right;white-space:nowrap;color:#64748b;width:64px">${x.paidAt ? new Date(x.paidAt).toLocaleDateString("es-HN", { day: "2-digit", month: "short", timeZone: "UTC" }) : "—"}</td>
              <td style="padding:5px 14px;text-align:right;font-weight:700;white-space:nowrap;width:110px">${fL(x.amount)}</td>
            </tr>`).join("")}
          </tbody>
        </table>`).join("")}
      <div style="background:#F8FAFC;font-weight:700;border-top:1px solid #E2E8F0;padding:6px 14px;display:flex;justify-content:space-between;font-size:11px">
        <span>Subtotal ${esc(r.short)}</span><span style="color:#059669">${fL(r.total)}</span>
      </div>
    </div>`;
    }).join("");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Costo de Maquinaria — ${mesTitulo} · Grupo Geotecnica</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:26px;color:#1E293B;-webkit-print-color-adjust:exact;print-color-adjust:exact}@media print{.np{display:none}}thead{display:table-header-group}tr{page-break-inside:avoid}</style>
    </head><body>
    <div style="page-break-after:always">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:14px">
        <div style="display:flex;align-items:center;gap:14px">
          <img src="${logoUrl}" style="height:52px" onerror="this.style.display='none'" />
          <div>
            <div style="font-size:9px;color:#7C3AED;font-weight:800;letter-spacing:1.8px;text-transform:uppercase">Grupo Geotecnica · Maquinaria</div>
            <div style="font-size:23px;font-weight:800;letter-spacing:-0.4px;color:#2C2A28">Costo de Maquinaria</div>
            <div style="font-size:13px;color:#64748b">Reporte ejecutivo mensual — <b style="color:#2C2A28">${mesTitulo}</b> · repuestos y mantenimiento</div>
          </div>
        </div>
        <div style="text-align:right;font-size:10px;color:#64748b">
          <div style="font-weight:800;color:#E8762D">Geotecnica Soluciones</div>
          <div style="font-weight:800;color:#2C5F5D">Subterra Honduras</div>
          <div style="margin-top:3px">Generado ${genFecha}</div>
        </div>
      </div>
      <div style="height:4px;background:linear-gradient(90deg,#7C3AED,#E8762D,#2C5F5D);border-radius:2px;margin:13px 0 16px"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px">
        ${kpi("Gasto total en maquinaria", fL(totalG), "#059669", `${delMes.length} pagos · ${rowsMaq.length} máquinas · ${rowsProy.length} proyectos`)}
        ${["geotecnica", "subterra"].filter(c2 => porEmp[c2].total > 0).map(c2 => kpi(c2 === "subterra" ? "Subterra Honduras" : "Geotecnica Soluciones", fL(porEmp[c2].total), c2 === "subterra" ? "#2C5F5D" : "#E8762D", `${porEmp[c2].n} pagos`)).join("")}
        ${kpi("Máquina más costosa", rowsMaq.length ? esc(rowsMaq[0].nombre) : "—", "#7C3AED", rowsMaq.length ? fL(rowsMaq[0].total) : "")}
      </div>
      <div style="display:flex;gap:14px;align-items:flex-start">
        <div style="flex:1.15;border:1px solid #E2E8F0;border-radius:10px;padding:12px;page-break-inside:avoid">
          <div style="font-size:10px;font-weight:800;color:#2C2A28;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px">Distribución del gasto por proyecto</div>
          <div style="display:flex;gap:14px;align-items:center">
            <svg width="140" height="140" viewBox="0 0 180 180" style="flex-shrink:0">
              ${donaSegs}
              <text x="90" y="86" text-anchor="middle" style="font-size:11px;font-weight:800;fill:#2C2A28">${rowsProy.length}</text>
              <text x="90" y="100" text-anchor="middle" style="font-size:8px;fill:#64748b">proyectos</text>
            </svg>
            <div style="flex:1">${donaLeyenda}</div>
          </div>
        </div>
        <div style="flex:1;border:1px solid #E2E8F0;border-radius:10px;padding:12px;page-break-inside:avoid">
          <div style="font-size:10px;font-weight:800;color:#2C2A28;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:9px">Gasto por máquina</div>
          ${barrasMaq}
        </div>
      </div>
    </div>
    <div style="border-left:4px solid #7C3AED;padding-left:12px;margin-bottom:14px">
      <div style="font-size:9px;color:#7C3AED;font-weight:800;letter-spacing:1.5px;text-transform:uppercase">Detalle por proyecto y máquina · ${mesTitulo}</div>
      <div style="font-size:11px;color:#64748b">Cada pago con su empresa: ${chipCo("geotecnica")} Geotecnica Soluciones · ${chipCo("subterra")} Subterra Honduras. Cada máquina bajo el proyecto al que está asignada.</div>
    </div>
    ${projBlocks}
    <div style="background:#2C2A28;color:#fff;border-radius:10px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;page-break-inside:avoid">
      <span style="font-size:12px;font-weight:700">GASTO TOTAL EN MAQUINARIA DEL GRUPO — ${mesTitulo}</span>
      <span style="font-size:17px;font-weight:800;color:#6EE7B7">${fL(totalG)}</span>
    </div>
    <div style="font-size:9px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:8px;margin-top:12px;line-height:1.5;page-break-inside:avoid">
      <b>Metodología:</b> se incluyen las solicitudes de pago de repuestos/mantenimiento con pago realizado cuya fecha de pago cae en ${mesTitulo}, de ambas empresas, agrupadas por el proyecto de la solicitud y la máquina vinculada. No incluye materiales de construcción (ver el reporte de GeoShopping).
      Preparado por ${esc(userName || "Operaciones")} · GeoMachinery — Sistema de Operaciones.
    </div>
    <br><button class="np" onclick="window.print()" style="padding:10px 24px;font-size:14px;cursor:pointer;background:#7C3AED;color:#fff;border:none;border-radius:8px;font-weight:700">Imprimir / Guardar como PDF</button>
    </body></html>`);
    w.document.close();
  };

  const renderCostosMaq = () => {
    const mesNombreRaw = (() => { const [y2, m2] = costosMesEjec.split("-").map(Number); return new Date(y2, m2 - 1, 1).toLocaleDateString("es-HN", { month: "long", year: "numeric" }); })();
    const { delMes, proy, maq, nombreMaq } = datosCostosMes(costosMesEjec);
    const rowsMaq = Object.entries(maq).map(([k, v]) => ({ key: k, nombre: nombreMaq(k), ...v })).sort((a, b) => b.total - a.total);
    const rowsProy = Object.values(proy).sort((a, b) => b.total - a.total);
    const totalG = rowsProy.reduce((sm, r) => sm + r.total, 0);
    const maxM = Math.max(...rowsMaq.map(r => r.total), 1);
    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: CHARCOAL }}>💵 Costo de Maquinaria</div>
          <div style={{ fontSize: 12, color: STONE, marginTop: 2 }}>Repuestos y mantenimiento por máquina y por proyecto — {mesNombreRaw}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: STONE, textTransform: "uppercase", letterSpacing: 0.5 }}>Mes del reporte</label>
            <input type="month" value={costosMesEjec} onChange={e => e.target.value && setCostosMesEjec(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 13, background: "#fff", fontFamily: "inherit" }} />
          </div>
          <Btn onClick={() => exportMaquinasEjecutivoPDF(costosMesEjec)}>🏢 Reporte ejecutivo PDF</Btn>
        </div>
      </div>
      {delMes.length === 0
        ? <div style={{ background: "#F8FAFC", border: "1px dashed #CBD5E1", borderRadius: 12, padding: 50, textAlign: "center", color: "#94A3B8" }}>Sin pagos de maquinaria en {mesNombreRaw}.</div>
        : <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {[["💰", fmtL(totalG), "Gasto total del mes", "#059669"], ["⚙️", rowsMaq.length, "Máquinas con gasto", "#7C3AED"], ["🏗️", rowsProy.length, "Proyectos", "#3E6A99"], ["🧾", delMes.length, "Pagos", "#B45309"]].map(([ic, v, l, c]) => (
              <div key={l} style={{ flex: 1, minWidth: 150, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 18px" }}>
                <div style={{ fontSize: 20 }}>{ic}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: c, marginTop: 4 }}>{v}</div>
                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>{l}</div>
              </div>))}
          </div>
          <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: CHARCOAL, marginBottom: 12 }}>⚙️ Por máquina</div>
            {rowsMaq.map(r => <div key={r.key} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: r.key === "__sin__" ? "#B45309" : CHARCOAL }}>
                <span>{r.key === "__sin__" ? "⚠ " : "⚙️ "}{r.nombre} <span style={{ color: STONE, fontWeight: 400 }}>({r.n})</span></span>
                <span style={{ color: "#059669" }}>{fmtL(r.total)}</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: "#F1F5F9", overflow: "hidden", marginTop: 4 }}>
                <div style={{ width: `${(r.total / maxM) * 100}%`, height: "100%", background: r.key === "__sin__" ? "#F59E0B" : "#7C3AED" }} />
              </div>
            </div>)}
          </div>
          <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: CHARCOAL, marginBottom: 12 }}>🏗️ Por proyecto (máquinas adentro)</div>
            {rowsProy.map(r => <details key={r.short} style={{ borderBottom: "1px solid #F1F5F9", padding: "8px 0" }}>
              <summary style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 800, color: CHARCOAL, listStyle: "none" }}>
                <span>{r.short} <span style={{ color: STONE, fontWeight: 400 }}>({r.n} pago{r.n !== 1 ? "s" : ""})</span></span>
                <span style={{ color: "#059669" }}>{fmtL(r.total)}</span>
              </summary>
              <div style={{ marginTop: 6, paddingLeft: 12 }}>
                {Object.entries(r.maqs).map(([mk2, v]) => <div key={mk2} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, padding: "3px 0", color: "#475569" }}>
                  <span>⚙ {nombreMaq(mk2)} <span style={{ color: "#94A3B8" }}>({v.items.length})</span></span>
                  <span style={{ fontWeight: 700 }}>{fmtL(v.total)}</span>
                </div>)}
              </div>
            </details>)}
          </div>
        </>}
    </div>;
  };

  const renderEntregasProveedor = () => {
    const activas = cp.filter(x => (x.status === "pagado" || x.status === "finalizado") && x.deliveryStatus === "entrega_proveedor");
    const grupos = {};
    activas.forEach(x => { const k = x.projectCode || "__sin__"; (grupos[k] = grupos[k] || []).push(x); });
    const keys = Object.keys(grupos).sort((a, b) => (a === "__sin__" ? 1 : b === "__sin__" ? -1 : a.localeCompare(b)));
    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "#CCFBF1", border: "1px solid #5EEAD4", borderRadius: 12, padding: 14, fontSize: 13, color: "#134E4A" }}>
        🏪 <b>Entregas de proveedor:</b> el proveedor lleva el repuesto directo. Descargá la <b>ficha en blanco</b>, mandásela a quien recibe, y cuando vuelva <b>firmada</b> subila acá — la compra pasa sola a <b>Por cerrar contable</b>. Si el proveedor no cumple, "🚛 No la entrega" la devuelve a Por coordinar.
      </div>
      {keys.length === 0
        ? <div style={{ background: "#F8FAFC", border: "1px dashed #CBD5E1", borderRadius: 12, padding: 60, textAlign: "center", color: "#94A3B8" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏪</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: CHARCOAL }}>Sin entregas de proveedor pendientes</div>
          </div>
        : keys.map(key => <div key={key} style={{ background: "#fff", borderRadius: 12, padding: 14, border: `1px solid ${BORDER}` }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: CHARCOAL, fontFamily: "ui-monospace, Menlo, monospace", borderBottom: "3px solid #0F766E", paddingBottom: 8, marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
              <span>{key === "__sin__" ? "SIN PROYECTO" : key}</span><Badge color="#0F766E">{grupos[key].length}</Badge>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 10 }}>
              {grupos[key].sort((a, b) => (a.delivery?.arrivalAt || "").localeCompare(b.delivery?.arrivalAt || "")).map(x => {
                const llega = x.delivery?.arrivalAt ? new Date(x.delivery.arrivalAt) : null;
                const atrasada = llega && llega < new Date();
                return <div key={x.id} style={{ background: "#fff", border: `1px solid ${atrasada ? "#FCD34D" : "#5EEAD4"}`, borderLeft: `3px solid ${atrasada ? "#B45309" : "#0F766E"}`, borderRadius: 8, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Badge color={atrasada ? "#B45309" : "#0F766E"}>{atrasada ? "⚠ Debió llegar" : "🏪 Llega directo"}</Badge>
                    {llega && <span style={{ fontSize: 10, color: "#64748b", fontWeight: 700 }}>📅 {llega.toLocaleDateString("es-HN", { day: "2-digit", month: "short" })} · {llega.toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit" })}</span>}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: CHARCOAL, marginTop: 6 }}>{x.provider}</div>
                  <div style={{ fontSize: 11.5, color: "#475569", marginTop: 2 }}>{x.description}</div>
                  {x.amount && <div style={{ fontSize: 11, color: "#059669", fontWeight: 700, marginTop: 4 }}>{fmtL(x.amount)}</div>}
                  {x.cierreResponsable && <div style={{ fontSize: 10.5, color: "#0F766E", marginTop: 3 }}>🧾 Cierra con conta: <b>{x.cierreResponsable}</b></div>}
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                    <button onClick={async () => { try { await generateFichaPDF(x, getProject(x.projectCode), COMPANIES[x.company]?.name); } catch (e) { if (!e?.isStaleChunk) alert("No se pudo: " + e.message); } }} style={{ background: "transparent", color: CHARCOAL, border: "1px solid #CBD5E1", padding: "6px 8px", borderRadius: 4, fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>📄 Descargar ficha en blanco</button>
                    {canSendToLogistics && <>
                      <input type="file" accept=".pdf,image/*" id={`mq-entrega-ficha-${x.id}`} style={{ display: "none" }}
                        onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; e.target.value = ""; const ok = await uploadFichaFromCard(x, f); if (ok) alert("✓ Ficha firmada subida.\nLa compra pasó a Por cerrar contable."); }} />
                      <label htmlFor={`mq-entrega-ficha-${x.id}`} style={{ background: "#0F766E", color: "#fff", padding: "7px 8px", borderRadius: 4, fontSize: 10.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", textAlign: "center", display: "block" }}>📎 Subir ficha FIRMADA</label>
                      <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
                        <button onClick={() => setModal({ t: "entrega-directa", d: x })} style={{ background: "none", border: "none", color: "#0891B2", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", padding: 0 }}>✏️ Cambiar fecha/hora</button>
                        <button onClick={() => revertirEntregaDirecta(x)} style={{ background: "none", border: "none", color: "#B45309", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", padding: 0 }}>🚛 No la entrega</button>
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
  // CERRADAS CONTABLEMENTE (19-ago-2026) — archivo ordenado de todo lo que ya
  // cerró, con filtros por MES de cierre y por PROYECTO. Se separó de "Por
  // cerrar" para que ese tablero quede solo con lo pendiente.
  // ─────────────────────────────────────────────────────────────────────────
  const renderCerradas = () => {
    const esCerrada = (x) => !!(x?.conta?.fileId || x?.conta?.facturaFile?.fileId);
    const todas = cp.filter(esCerrada);
    const mesDeCierre = (x) => String(x.conta?.cerradoAt || "").slice(0, 7);
    const meses = [...new Set(todas.map(mesDeCierre).filter(Boolean))].sort().reverse();
    const proyectos = [...new Set(todas.map(x => x.projectCode || "SIN PROYECTO"))].sort();
    const lista = todas
      .filter(x => !cerrMes || mesDeCierre(x) === cerrMes)
      .filter(x => !cerrProy || (x.projectCode || "SIN PROYECTO") === cerrProy)
      .filter(x => {
        if (!cerrQ.trim()) return true;
        const t = cerrQ.trim().toLowerCase();
        return [x.codigo, x.provider, x.description, x.projectCode].some(v => String(v || "").toLowerCase().includes(t));
      })
      .sort((a, b) => String(b.conta?.cerradoAt || "").localeCompare(String(a.conta?.cerradoAt || "")));
    const total = lista.reduce((sm, x) => sm + (Number(x.amount) || 0), 0);
    const verArchivo = async (ref) => {
      if (!ref?.fileId) return alert("Sin archivo adjunto.");
      try {
        const full = await store.get(fileKey(ref.fileId));
        if (!full?.dataUrl) return alert("No se pudo cargar el archivo.");
        const w = window.open();
        if (w) w.document.write(full.type === "application/pdf" ? `<iframe src='${full.dataUrl}' style='width:100vw;height:100vh;border:none'></iframe>` : `<img src='${full.dataUrl}' style='max-width:100vw'/>`);
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
                {lista.map(x => (
                  <tr key={x.id} style={{ borderTop: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "8px 12px", fontWeight: 800, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11.5, color: CHARCOAL, whiteSpace: "nowrap" }}>{x.codigo || "—"}</td>
                    <td style={{ padding: "8px 12px", color: "#64748b", whiteSpace: "nowrap" }}>{x.conta?.cerradoAt ? new Date(x.conta.cerradoAt).toLocaleDateString("es-HN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
                    <td style={{ padding: "8px 12px", fontWeight: 600 }}>{x.projectCode || "—"}</td>
                    <td style={{ padding: "8px 12px" }}>{x.provider}</td>
                    <td style={{ padding: "8px 12px", color: "#475569", maxWidth: 300 }}>{String(x.description || "").slice(0, 90)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: "#059669", whiteSpace: "nowrap" }}>{fmtL(x.amount)}</td>
                    <td style={{ padding: "8px 12px", fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>{x.conta?.cerradoPor || "—"}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {x.conta?.facturaFile?.fileId && <Btn small variant="ghost" onClick={() => verArchivo(x.conta.facturaFile)}>🧾 Factura</Btn>}
                        {x.conta?.fileId && <Btn small variant="ghost" onClick={() => verArchivo({ fileId: x.conta.fileId, type: x.conta.type })}>📦 Paquete</Btn>}
                        <Btn small variant="ghost" onClick={() => imprimirPaqueteConta(x)}>📥 PDF</Btn>
                        {(isAdmin || isCoordinadorMaquinas) && <Btn small variant="danger" onClick={() => reabrirCierreConta(x)}>↩</Btn>}
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
    const clasificar = (x) => {
      if (x.status !== "pagado" && x.status !== "finalizado") return null;
      if (x.conta?.fileId || x.conta?.facturaFile?.fileId) return "cerrada";
      if (x.deliveryStatus === "ficha_adjunta" || x.deliveryStatus === "cerrado") return "lista";
      if (x.deliveryStatus === "entrega_proveedor") return "falta_proveedor";
      const d = despachoDe(x.id);
      if (d) return (d.estado === "entregado" || d.estado === "cerrado") ? "falta_logistica" : "en_camino";
      return null;
    };
    // Meses disponibles (con algo por cerrar o cerrado), para el selector.
    const mesDe = (x) => String(x.paidAt || x.createdAt || "").slice(0, 7);
    const mesesDisponibles = [...new Set(cp.filter(x => clasificar(x)).map(mesDe).filter(Boolean))].sort().reverse();
    const enMes = (x) => !contaMes || mesDe(x) === contaMes;
    const grupos = {}; const totales = { lista: 0, falta_logistica: 0, falta_proveedor: 0, en_camino: 0, cerrada: 0 };
    cp.filter(enMes).forEach(x => { const b = clasificar(x); if (!b) return; const k = x.projectCode || "__sin__"; (grupos[k] = grupos[k] || { lista: [], falta_logistica: [], falta_proveedor: [], en_camino: [], cerrada: [] })[b].push(x); totales[b]++; });
    const keys = Object.keys(grupos).filter(k => grupos[k].lista.length + grupos[k].falta_logistica.length + grupos[k].falta_proveedor.length + grupos[k].en_camino.length > 0)
      .sort((a, b) => (a === "__sin__" ? 1 : b === "__sin__" ? -1 : a.localeCompare(b)));
    const cerradas = cp.filter(enMes).filter(x => clasificar(x) === "cerrada").sort((a, b) => String(b.conta?.cerradoAt || "").localeCompare(String(a.conta?.cerradoAt || "")));
    const puedeCerrarConta = isAdmin || isCoordinadorMaquinas || isCostos || isAsistenteCompras;
    const cardConta = (x, tipo) => {
      const d = despachoDe(x.id);
      const cfg = {
        lista:           { badge: x.deliveryStatus === "cerrado" && !x.delivery?.fichaFile ? "🔒 Sin ficha — lista" : "✓ Ficha lista — armar paquete", c: "#059669", border: "#6EE7B7" },
        falta_logistica: { badge: "⚠ SIN FICHA de recibido — LOGÍSTICA debe subirla", c: "#DC2626", border: "#FCA5A5" },
        falta_proveedor: { badge: "🏪 Falta ficha firmada (entrega el proveedor)", c: "#B45309", border: "#FCD34D" },
        en_camino:       { badge: `🚚 Con Logística (${d?.estado || "pendiente"})`, c: "#0891B2", border: "#BAE6FD" },
      }[tipo];
      const maquina = machines.find(m => m.id === x.machineId);
      return <div key={x.id} style={{ background: "#fff", border: `1px solid ${cfg.border}`, borderLeft: `3px solid ${cfg.c}`, borderRadius: 8, padding: 12 }}>
        <span style={{ display: "inline-block", background: cfg.c + "18", color: cfg.c, padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, lineHeight: 1.35 }}>{cfg.badge}</span>
        {x.codigo && <div style={{ fontSize: 10.5, fontWeight: 800, color: "#64748b", fontFamily: "ui-monospace, Menlo, monospace", marginTop: 5 }}>{x.codigo}</div>}
        <div style={{ fontSize: 13, fontWeight: 800, color: CHARCOAL, marginTop: 2 }}>{x.provider}</div>
        <div style={{ fontSize: 11.5, color: "#475569", marginTop: 2 }}>{x.description}</div>
        {maquina && <div style={{ fontSize: 10.5, color: "#7C3AED", marginTop: 3 }}>⚙️ {maquina.nombre}</div>}
        {x.amount && <div style={{ fontSize: 11, color: "#059669", fontWeight: 700, marginTop: 4 }}>{fmtL(x.amount)}</div>}
        <div style={{ fontSize: 10.5, color: x.cierreResponsable ? "#0F766E" : "#B45309", marginTop: 3 }}>🧾 Cierra con conta: <b>{x.cierreResponsable || "sin asignar"}</b></div>
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {tipo === "falta_proveedor" && <button onClick={() => setSec("entregas")} style={{ background: "transparent", color: "#0F766E", border: "1px solid #5EEAD4", padding: "6px 8px", borderRadius: 4, fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>→ Gestionarla en Entregas de proveedor</button>}
          {tipo === "lista" && <>
            <button onClick={() => imprimirPaqueteConta(x)} style={{ background: CHARCOAL, color: "#F0EBE3", border: "none", padding: "7px 8px", borderRadius: 4, fontSize: 10.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }} title="Descarga UN PDF con portada, checklist y todos los documentos adjuntos">📥 Descargar paquete de cierre (PDF)</button>
            {puedeCerrarConta && <>
              <input type="file" accept=".pdf,image/*" id={`mq-conta-fact-${x.id}`} style={{ display: "none" }}
                onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; e.target.value = ""; const ok = await uploadPaqueteConta(x, f, "factura"); if (ok) alert("✅ Factura subida — la compra quedó CERRADA CONTABLEMENTE.\n\nPasó al apartado \"Cerradas contablemente\"."); }} />
              <label htmlFor={`mq-conta-fact-${x.id}`} style={{ background: "#059669", color: "#fff", padding: "8px 8px", borderRadius: 4, fontSize: 10.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", textAlign: "center", display: "block" }} title="Escaneá SOLO la factura que trajo el proveedor — con eso la compra se cierra">🧾 Subir FACTURA escaneada (CIERRA la compra)</label>
              <input type="file" accept=".pdf,image/*" id={`mq-conta-paq-${x.id}`} style={{ display: "none" }}
                onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; e.target.value = ""; const ok = await uploadPaqueteConta(x, f, "paquete"); if (ok) alert("✅ Paquete completo subido — la compra quedó CERRADA CONTABLEMENTE."); }} />
              <label htmlFor={`mq-conta-paq-${x.id}`} style={{ background: "transparent", color: "#059669", border: "1px solid #6EE7B7", padding: "5px 8px", borderRadius: 4, fontSize: 9.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "center", display: "block" }} title="Alternativa: subir el paquete entero ya escaneado con todo adentro">…o el paquete completo escaneado</label>
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
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {[["🧾", totales.lista + totales.falta_logistica + totales.falta_proveedor + totales.en_camino, "Por cerrar", "#B45309"], ["✓", totales.lista, "Documentos listos", "#059669"], ["⚠", totales.falta_logistica, "Sin ficha de Logística", "#DC2626"], ["✅", totales.cerrada, "Cerradas", "#64748b"]].map(([ic, n, lbl, c]) => (
          <div key={lbl} style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 16px", minWidth: 140 }}>
            <div style={{ fontSize: 18 }}>{ic}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: c, marginTop: 2 }}>{n}</div>
            <div style={{ fontSize: 9.5, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{lbl}</div>
          </div>))}
      </div>
      <div style={{ background: "#FFFBEB", border: "1px solid #F59E0B", borderRadius: 12, padding: 14, fontSize: 13, color: "#78350F" }}>
        🧾 <b>La regla del cierre:</b> con la ficha adjunta, imprimí el <b>paquete de cierre</b>, agregale la factura física y entregáselo a Contabilidad. Cuando conta lo devuelva procesado, <b>subilo digitalizado acá</b> — solo eso cierra la compra.
      </div>
      {keys.length === 0
        ? <div style={{ background: "#F8FAFC", border: "1px dashed #CBD5E1", borderRadius: 12, padding: 60, textAlign: "center", color: "#94A3B8" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: CHARCOAL }}>Nada por cerrar contablemente</div>
          </div>
        : keys.map(key => { const g = grupos[key]; const nAct = g.lista.length + g.falta_logistica.length + g.falta_proveedor.length + g.en_camino.length; return (
          <div key={key} style={{ background: "#fff", borderRadius: 12, padding: 14, border: `1px solid ${BORDER}` }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: CHARCOAL, fontFamily: "ui-monospace, Menlo, monospace", borderBottom: "3px solid #B45309", paddingBottom: 8, marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
              <span>{key === "__sin__" ? "SIN PROYECTO" : key}</span><Badge color="#B45309">{nAct}</Badge>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 10 }}>
              {g.lista.map(x => cardConta(x, "lista"))}
              {g.falta_logistica.map(x => cardConta(x, "falta_logistica"))}
              {g.falta_proveedor.map(x => cardConta(x, "falta_proveedor"))}
              {g.en_camino.map(x => cardConta(x, "en_camino"))}
            </div>
          </div>); })}
    </div>;
  };

  const renderResumen = () => {
    // Filtros del Command Center
    // - showCompleted: incluir las "listas" (ficha subida o cerradas).
    //   Por default ocultas — el coordinador solo ve lo que tiene accion pendiente.
    const showCompleted = resumenFilter.showCompleted;
    const projFilter = resumenFilter.projectCode;
    const monthFilter = resumenFilter.month;
    const monthLabel = monthFilter ? (() => {
      const [y, m] = monthFilter.split("-").map(Number);
      return new Date(y, m - 1, 1).toLocaleDateString("es-HN", { month: "long", year: "numeric" });
    })() : "";

    // Agrupar solicitudes por proyecto, filtrando segun company actual
    const grupos = {};
    cp.forEach(p => {
      // "Lista" = ficha de recibido subida o cerrada sin logistica (mismo
      // criterio que GeoShopping ahora que Maquinas tiene el flujo completo).
      const lista = computeLifecycle(p).lista;
      if (!showCompleted && lista) return;
      if (projFilter && p.projectCode !== projFilter) return;
      // Filtro por mes de carga (createdAt). "" = todos los meses.
      if (monthFilter && String(p.createdAt || "").slice(0, 7) !== monthFilter) return;
      const key = p.projectCode || "_sin_proyecto";
      (grupos[key] = grupos[key] || []).push(p);
    });

    const proyectosConCompras = Object.keys(grupos).sort();

    if (proyectosConCompras.length === 0) {
      return (
        <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>📊</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#475569" }}>
            {monthFilter ? `Nada pendiente cargado en ${monthLabel}` : showCompleted ? "No hay solicitudes para mostrar" : "✓ Todo al dia — no hay acciones pendientes"}
          </div>
          {!showCompleted && <div style={{ marginTop: 8, fontSize: 13 }}>Activa "Mostrar completas" para ver las solicitudes ya listas (ficha subida o cerradas).</div>}
          {monthFilter && (
            <div style={{ marginTop: 12 }}>
              <Btn small variant="ghost" onClick={() => setResumenFilter(s => ({ ...s, month: "" }))}>Ver todos los meses</Btn>
            </div>
          )}
        </div>
      );
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Filtros */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, color: CHARCOAL }}>
            <input type="checkbox" checked={showCompleted} onChange={e => setResumenFilter(s => ({ ...s, showCompleted: e.target.checked }))} />
            Mostrar completas (pagadas + comprobante)
          </label>
          <div style={{ height: 20, width: 1, background: "#E2E8F0" }} />
          <Select
            label=""
            options={[{ value: "", label: "Todos los proyectos" }, ...allProjects.map(p => ({ value: p.short, label: p.short }))]}
            value={projFilter}
            onChange={e => setResumenFilter(s => ({ ...s, projectCode: e.target.value }))}
            emptyLabel="Todos los proyectos"
          />
          <div style={{ height: 20, width: 1, background: "#E2E8F0" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: CHARCOAL }}>Mes:</span>
            <input type="month" value={monthFilter} onChange={e => setResumenFilter(s => ({ ...s, month: e.target.value }))}
              title="Filtra por mes de carga de la solicitud"
              style={{ padding: "6px 10px", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12, background: "#fff", fontFamily: "inherit" }} />
            {monthFilter
              ? <button onClick={() => setResumenFilter(s => ({ ...s, month: "" }))} style={{ background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer", color: "#64748b", fontFamily: "inherit" }}>Todos</button>
              : <span style={{ fontSize: 11, color: "#94A3B8", fontStyle: "italic" }}>todos los meses</span>}
          </div>
          <div style={{ marginLeft: "auto", fontSize: 12, color: "#64748b", fontWeight: 600 }}>
            {monthFilter ? `${monthLabel} · ` : ""}{proyectosConCompras.length} proyectos · {Object.values(grupos).reduce((a, l) => a + l.length, 0)} solicitudes
          </div>
        </div>

        {/* Leyenda */}
        <div style={{ background: "#F8FAFC", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 12px", display: "flex", gap: 16, fontSize: 11, color: "#64748b", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontWeight: 700, color: CHARCOAL }}>Leyenda:</span>
          <span><span style={{ display: "inline-block", width: 12, height: 12, background: "#059669", borderRadius: 2, verticalAlign: "middle", marginRight: 4 }} />Completado</span>
          <span><span style={{ display: "inline-block", width: 12, height: 12, background: "#F59E0B", borderRadius: 2, verticalAlign: "middle", marginRight: 4, border: "2px solid #D97706" }} />Siguiente accion</span>
          <span><span style={{ display: "inline-block", width: 12, height: 12, background: "#E2E8F0", borderRadius: 2, verticalAlign: "middle", marginRight: 4 }} />Pendiente</span>
          <span style={{ marginLeft: "auto", fontStyle: "italic" }}>Click una solicitud para abrir el detalle completo</span>
        </div>

        {/* Proyectos */}
        {proyectosConCompras.map(key => {
          const items = grupos[key];
          const proj = allProjects.find(p => p.short === key);
          const projName = proj?.name || "";
          const projColor = proj?.color || "#475569";
          const totalMonto = items.reduce((a, p) => a + Number(p.amount || 0), 0);
          // Stats de fases — solo compras que tienen accion pendiente (no listas)
          const pendingByOwner = {};
          items.forEach(p => {
            const lc = computeLifecycle(p);
            if (lc.nextOwner && lc.nextOwner !== "" && !lc.lista) {
              pendingByOwner[lc.nextOwner] = (pendingByOwner[lc.nextOwner] || 0) + 1;
            }
          });

          return (
            <details key={key} open style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
              {/* Header del proyecto — click para plegar/desplegar */}
              <summary style={{ padding: "14px 18px", background: projColor + "15", borderBottom: `2px solid ${projColor}40`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, cursor: "pointer", listStyle: "none" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: projColor, fontFamily: "ui-monospace, Menlo, monospace", letterSpacing: 0.3 }}>{key}</div>
                  {projName && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{projName}</div>}
                </div>
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#059669" }}>{fmtL(totalMonto)}</div>
                    <div style={{ fontSize: 10, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.5 }}>{items.length} solicitudes</div>
                  </div>
                  <span title="Plegar / desplegar" style={{ fontSize: 12, color: projColor, fontWeight: 700 }}>▾</span>
                </div>
              </summary>

              {/* Resumen de acciones pendientes por owner */}
              {Object.keys(pendingByOwner).length > 0 && (
                <div style={{ padding: "8px 18px", background: "#FFFBEB", borderBottom: `1px solid #FCD34D`, fontSize: 12, color: "#92400E", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontWeight: 700 }}>⚠️ Pendiente:</span>
                  {Object.entries(pendingByOwner).map(([owner, count]) => (
                    <span key={owner} style={{ background: "#FCD34D40", padding: "3px 10px", borderRadius: 12, fontWeight: 600 }}>{owner}: {count}</span>
                  ))}
                </div>
              )}

              {/* Tabla de compras */}
              <div>
                {items.map((p, idx) => {
                  const lc = computeLifecycle(p);
                  return (
                    <div
                      key={p.id}
                      onClick={() => setModal({ t: "detail", d: p })}
                      style={{
                        padding: "12px 18px",
                        borderTop: idx === 0 ? "none" : `1px solid #F1F5F9`,
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1.5fr) 1fr auto minmax(0, 1.3fr)",
                        gap: 16,
                        alignItems: "center",
                        cursor: "pointer",
                        transition: "background .12s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "#FAFAFB"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      {/* Provider + descripcion */}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: CHARCOAL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.provider || "—"}</div>
                        <div style={{ fontSize: 11, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{p.description}</div>
                      </div>

                      {/* Lifecycle bar */}
                      <div>{renderLifecycleBar(p, lc)}</div>

                      {/* Monto */}
                      <div style={{ textAlign: "right", minWidth: 100 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#059669" }}>{fmtL(p.amount)}</div>
                      </div>

                      {/* Siguiente accion + estado de entrega (que esta
                          entregado y que no, de un vistazo) */}
                      <div style={{ minWidth: 0 }}>
                        {lc.lista ? (
                          <div style={{ fontSize: 11, color: "#059669", fontWeight: 700 }}>
                            {lc.cerradoSinLog && !lc.fichaUploaded ? "🔒 Cerrada sin logística" : "🚚 Entregado · ✓ Lista — pasar a contabilidad"}
                          </div>
                        ) : (
                          <>
                            {lc.isPaid && (
                              <span style={{
                                display: "inline-block", fontSize: 9, fontWeight: 800, padding: "2px 8px", borderRadius: 8, marginBottom: 3, letterSpacing: 0.3,
                                background: lc.entregado ? "#DCFCE7" : lc.hasDesp ? "#DBEAFE" : "#EDE9FE",
                                color: lc.entregado ? "#166534" : lc.hasDesp ? "#1E40AF" : "#6B21A8",
                              }}>
                                {lc.entregado ? "🚚 ENTREGADO" : lc.hasDesp ? "🚛 EN LOGÍSTICA" : "🕐 SIN COORDINAR"}
                              </span>
                            )}
                            <div style={{ fontSize: 11, fontWeight: 700, color: lc.entregado ? "#166534" : "#9A4F1D", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lc.nextAction}</div>
                            {lc.nextOwner && <div style={{ fontSize: 10, color: "#64748b", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>→ {lc.nextOwner}</div>}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // MAQUINAS — CRUD del catalogo de maquinaria
  // Lic. Fernando Diaz registra las maquinas y compresores aqui para luego
  // vincularlos a las solicitudes de pago.
  // ─────────────────────────────────────────────────────────────────────────
  const renderMachines = () => {
    const sorted = machines.slice().sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "#EFF6FF", border: "1px solid #93C5FD", borderRadius: 10, padding: 14, fontSize: 13, color: "#1E40AF" }}>
        ⚙️ <b>{machines.length} maquina(s) registrada(s).</b> Al crear una nueva solicitud de pago podes vincularla a la maquina afectada (repuesto, mantenimiento, etc.).
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
        {canManageMachines && <Btn variant="primary" onClick={() => setModal({ t: "machine-new" })}>+ Agregar maquina</Btn>}
      </div>
      {sorted.length === 0
        ? <div style={{ background: "#F8FAFC", border: "1px dashed #CBD5E1", borderRadius: 12, padding: 40, textAlign: "center", color: "#94A3B8" }}>
            Aun no hay maquinas registradas. Click en + Agregar maquina.
          </div>
        : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            {sorted.map(m => {
              const isCompresor = m.tipo === "compresor";
              const tipoColor = isCompresor ? "#0891B2" : "#E8762D";
              return <div
                key={m.id}
                onClick={() => canManageMachines && setModal({ t: "machine-edit", d: m })}
                style={{
                  background: "#fff",
                  border: "1px solid #E2E8F0",
                  borderLeft: `4px solid ${tipoColor}`,
                  borderRadius: 12,
                  padding: 14,
                  cursor: canManageMachines ? "pointer" : "default",
                  transition: "all 0.15s",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
                onMouseEnter={e => canManageMachines && (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)")}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
              >
                {m.foto?.dataUrl
                  ? <img src={m.foto.dataUrl} alt={m.nombre} style={{ width: "100%", height: 130, objectFit: "cover", borderRadius: 8, background: "#F1F5F9" }} />
                  : <div style={{ width: "100%", height: 130, borderRadius: 8, background: "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, color: "#CBD5E1" }}>{isCompresor ? "💨" : "⚙️"}</div>}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: CHARCOAL, lineHeight: 1.3, flex: 1 }}>{m.nombre}</div>
                  <Badge color={tipoColor}>{isCompresor ? "Compresor" : "Maquina"}</Badge>
                </div>
                {!isCompresor && (m.diametroTipo || m.diametroNotas) && (
                  <div style={{ fontSize: 12, color: "#475569" }}>
                    {m.diametroTipo && <span style={{ fontWeight: 700, textTransform: "capitalize" }}>{m.diametroTipo}</span>}
                    {m.diametroTipo && m.diametroNotas && " — "}
                    {m.diametroNotas && <span>{m.diametroNotas}</span>}
                  </div>
                )}
              </div>;
            })}
          </div>}
    </div>;
  };

  const renderList = () => {
    const dataSorted = filtered.slice().sort((a, b) => {
      // Orden: primero validados (pendientes de pago), luego pagados sin comprobante, luego borradores, al final finalizados
      const ord = { validado: 1, pagado: 2, borrador: 3, finalizado: 4 };
      const da = ord[a.status] || 9, db = ord[b.status] || 9;
      if (da !== db) return da - db;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    const providers = [...new Set(cp.map(p => p.provider).filter(Boolean))].sort();

    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Stats cards */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <StatCard icon="📋" label="Total solicitudes" value={stats.total} color="#BE185D" />
        <StatCard icon="⏳" label="Pendiente de pago" value={stats.validado} color="#D97706" />
        <StatCard icon="💸" label="Pagadas sin comprobante" value={stats.pagado} color="#2563EB" />
        <StatCard icon="✅" label="Finalizadas" value={stats.finalizado} color="#059669" />
        <StatCard icon="💰" label="Monto por pagar" value={fmtL(stats.montoPendiente)} color="#DC2626" />
        <StatCard icon="📅" label="Pagado este mes" value={fmtL(stats.montoPagadoMes)} color="#059669" />
        {stats.sinRecibido > 0 && <StatCard icon="📦" label="Pagadas sin recibido" value={stats.sinRecibido} color="#7C3AED" />}
      </div>

      {/* Carolina destacado si es tesoreria */}
      {isTesoreria && stats.validado > 0 && <div style={{ background: "linear-gradient(135deg, #FEF3C7, #FDE68A)", border: "1px solid #F59E0B", borderRadius: 12, padding: 14, color: "#92400E", fontSize: 14, fontWeight: 600 }}>
        👋 Hola Lic. Carolina, tenes <b style={{ fontSize: 18, color: "#D97706" }}>{stats.validado} solicitud{stats.validado === 1 ? "" : "es"}</b> pendiente{stats.validado === 1 ? "" : "s"} de pago — <b>{fmtL(stats.montoPendiente)}</b>
      </div>}

      {/* Filtros + acciones */}
      <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: 14, display: "grid", gridTemplateColumns: "1.2fr 1.2fr 1.5fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
        <Select label="Estado" emptyLabel="Todas" options={Object.entries(STATUSES).map(([k, v]) => ({ value: k, label: v.label }))} value={filter.status} onChange={e => setFilter(s => ({ ...s, status: e.target.value }))} />
        <Select label="Proyecto" options={allProjects.map(p => ({ value: p.short, label: p.short }))} value={filter.project} onChange={e => setFilter(s => ({ ...s, project: e.target.value }))} />
        <Input label="Proveedor" value={filter.provider} onChange={e => setFilter(s => ({ ...s, provider: e.target.value }))} placeholder="Buscar..." list="providers-list" />
        <datalist id="providers-list">{providers.map(pv => <option key={pv} value={pv} />)}</datalist>
        <Input label="Desde" type="date" value={filter.from} onChange={e => setFilter(s => ({ ...s, from: e.target.value }))} />
        <Input label="Hasta" type="date" value={filter.to} onChange={e => setFilter(s => ({ ...s, to: e.target.value }))} />
        <Btn small variant="ghost" onClick={() => setFilter({ status: "", project: "", provider: "", from: "", to: "" })}>Limpiar</Btn>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#64748b", fontSize: 13 }}>{filtered.length} de {cp.length} solicitudes</span>
        {isAdmin && cp.some(p => p && !p.codigo) && <Btn variant="ghost" onClick={asignarCodigosFaltantes} title="Numera las solicitudes viejas que todavía no tienen código">🔢 Asignar códigos faltantes ({purchases.filter(p => p && !p.codigo).length})</Btn>}
        {canCreate && <Btn variant="primary" onClick={() => setModal({ t: "new" })}>+ Nueva solicitud</Btn>}
        {!canCreate && canPay && <div style={{ fontSize: 12, color: "#64748b" }}>Click en una fila para revisar y gestionar el pago →</div>}
      </div>

      {/* Tabla */}
      <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid #E2E8F0", background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: "#F1F5F9" }}>
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
            {dataSorted.map(p => <tr key={p.id} style={{ borderBottom: "1px solid #F1F5F9", cursor: "pointer" }} onClick={() => setModal({ t: "detail", d: p })}>
              <td style={{ ...TD, fontFamily: "ui-monospace, Menlo, monospace", fontWeight: 800, fontSize: 11.5, color: CHARCOAL, whiteSpace: "nowrap" }}>{p.codigo || <span style={{ color: "#CBD5E1", fontWeight: 400 }}>—</span>}</td>
              <td style={TD}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                  <StatusBadge status={p.status} />
                  <TreasuryBadge status={p.treasuryStatus} />
                  <DeliveryBadge status={p.deliveryStatus} />
                </div>
              </td>
              <td style={TD}><Badge color={cc.color}>{p.projectCode}</Badge></td>
              <td style={{ ...TD, fontWeight: 600 }}>{p.provider}</td>
              <td style={{ ...TD, maxWidth: 280, whiteSpace: "normal" }}>{p.description}</td>
              <td style={{ ...TD, fontWeight: 700, color: "#059669" }}>{fmtL(p.amount)}</td>
              <td style={TD}>{fmt(p.createdAt)}</td>
              <td style={TD}>{p.paymentDate ? fmt(p.paymentDate) : "—"}</td>
              <td style={TD}>{p.opsResponsible || "—"}</td>
              <td style={{ ...TD, textAlign: "center" }}>{p.quoteFile ? <span title={p.quoteFile.name} style={{ color: "#2563EB", fontSize: 18 }}>📄</span> : <span style={{ color: "#CBD5E1" }}>—</span>}</td>
              <td style={{ ...TD, textAlign: "center" }}>{p.receiptFile ? <span title={p.receiptFile.name} style={{ color: "#059669", fontSize: 18 }}>🧾</span> : <span style={{ color: "#CBD5E1" }}>—</span>}</td>
              <td style={{ ...TD, textAlign: "right" }} onClick={e => e.stopPropagation()}>
                <Btn small variant="ghost" onClick={() => setModal({ t: "detail", d: p })}>Ver</Btn>
              </td>
            </tr>)}
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
      case "new": return <Modal title="Nueva solicitud de pago — Maquinas" onClose={() => setModal(null)} wide><PurchaseFormImpl co={co} userName={userName} setModal={setModal} getProject={getProject} allProjects={allProjects} purchases={purchases} providers={providers} machines={machines} addAudit={addAudit} saveOrAlert={saveOrAlert} /></Modal>;
      case "edit": return <Modal title={`Editar solicitud — ${m.d.provider}`} onClose={() => setModal(null)} wide><PurchaseFormImpl purchase={m.d} co={co} userName={userName} setModal={setModal} getProject={getProject} allProjects={allProjects} purchases={purchases} providers={providers} machines={machines} addAudit={addAudit} saveOrAlert={saveOrAlert} /></Modal>;
      case "detail": return <Modal title={`Solicitud: ${m.d.provider} — ${m.d.projectCode}`} onClose={() => setModal(null)} wide><DetailView purchase={m.d} /></Modal>;
      case "pay": return <Modal title={`Registrar pago — ${m.d.provider}`} onClose={() => setModal(null)} wide><PaymentFormImpl purchase={m.d} setModal={setModal} addAudit={addAudit} updatePurchase={updatePurchase} /></Modal>;
      case "new-project": return <Modal title="Nuevo proyecto" onClose={() => setModal(null)}><ProjectFormImpl allProjects={allProjects} upsertProjectMeta={upsertProjectMeta} renameProjectAlias={renameProjectAlias} setModal={setModal} onSaved={(short) => { if (m.returnTo) setModal(m.returnTo); }} /></Modal>;
      case "edit-project": return <Modal title={`Editar proyecto — ${m.d.short}`} onClose={() => setModal(null)}><ProjectFormImpl allProjects={allProjects} upsertProjectMeta={upsertProjectMeta} renameProjectAlias={renameProjectAlias} setModal={setModal} project={m.d} /></Modal>;
      case "provider-new":  return <Modal title="Nuevo proveedor" onClose={() => setModal(null)} wide><ProviderFormImpl setModal={setModal} upsertProvider={upsertProvider} /></Modal>;
      case "provider-edit": return <Modal title={`Editar proveedor — ${m.d.name}`} onClose={() => setModal(null)} wide><ProviderFormImpl provider={m.d} setModal={setModal} upsertProvider={upsertProvider} deleteProvider={deleteProvider} /></Modal>;
      case "machine-new":   return <Modal title="Nueva maquina" onClose={() => setModal(null)}><MachineFormImpl setModal={setModal} upsertMachine={upsertMachine} /></Modal>;
      case "machine-edit":  return <Modal title={`Editar maquina — ${m.d.nombre}`} onClose={() => setModal(null)}><MachineFormImpl machine={m.d} setModal={setModal} upsertMachine={upsertMachine} deleteMachine={deleteMachine} /></Modal>;
      case "send-pickup":   return <Modal title={`🚛 Enviar a Logistica — ${m.d.provider}`} onClose={() => setModal(null)}><SendPickupFormImpl purchase={m.d} provider={findProviderByName(m.d.provider)} setModal={setModal} enviarAOrdenRecogida={enviarAOrdenRecogida} /></Modal>;
      case "entrega-directa": return <Modal title={`🏪 La entrega el proveedor — ${m.d.provider}`} onClose={() => setModal(null)}><EntregaDirectaFormImpl purchase={m.d} provider={findProviderByName(m.d.provider)} setModal={setModal} marcarEntregaDirecta={marcarEntregaDirecta} /></Modal>;
      default: return null;
    }
  };

  // ── LAYOUT ──
  const allNav = [
    { id: "dashboard", icon: "🎯", label: "Dashboard" },
    { id: "resumen", icon: "📊", label: "Resumen" },
    { id: "list", icon: "📋", label: "Solicitudes" },
    { id: "projects", icon: "🏗️", label: "Proyectos" },
    { id: "machines", icon: "⚙️", label: "Maquinas" },
    { id: "costos", icon: "💵", label: "Costos" },
    { id: "coordinar", icon: "📦", label: "Por coordinar" },
    { id: "entregas", icon: "🏪", label: "Entregas de proveedor" },
    { id: "conta", icon: "🧾", label: "Por cerrar contable" },
    { id: "cerradas", icon: "✅", label: "Cerradas" },
    { id: "providers", icon: "🏢", label: "Proveedores" },
  ];
  const canSeeResumen = isAdmin || isGerencia || isCostos || isCoordinadorMaquinas || isVisorCompras;
  // Costos de maquinaria: SOLO admin / gerencia / costos. Fernando
  // (coordinador_maquinas) NO la ve ni exporta — pedido de Gerson 19-ago-2026
  // (él sí ve el Dashboard y elige el mes, pero sin descargar nada).
  const canSeeCostosMaq = isAdmin || isGerencia || isCostos;
  const visibleNav = allNav.filter(n => {
    if (n.id === "costos") return canSeeCostosMaq;
    if (n.id === "resumen" || n.id === "dashboard") return canSeeResumen;
    return true;
  });
  const roleLabel = isAdmin ? "Operaciones" : isTesoreria ? "Tesoreria" : isGerencia ? "Gerencia (solo lectura)" : isVisorCompras ? "Visor de Compras (solo lectura)" : isCostos ? "Costos / Operaciones" : isCoordinadorMaquinas ? "Coord. Maquinas" : userRole;
  const logoUrl = `${import.meta.env.BASE_URL}brand/logo-color.png`;

  // SVG cartoon de piloteadora BAUER
  const PiloteadoraSVG = ({ height = 180 }) => (
    <svg viewBox="0 0 200 260" xmlns="http://www.w3.org/2000/svg" style={{ height, width: "auto", display: "block" }} aria-hidden="true">
      {/* Orugas (base) */}
      <rect x="18" y="220" width="164" height="26" rx="13" fill="#1E3A8A" />
      <rect x="26" y="226" width="148" height="14" rx="7" fill="#0F172A" />
      {/* Detalles de orugas (segmentos) */}
      {[36, 56, 76, 96, 116, 136, 156].map(x => (
        <rect key={x} x={x} y="228" width="8" height="10" rx="1" fill="#1E3A8A" />
      ))}
      {/* Ruedas guía */}
      <circle cx="30" cy="233" r="9" fill="#374151" stroke="#0F172A" strokeWidth="2" />
      <circle cx="170" cy="233" r="9" fill="#374151" stroke="#0F172A" strokeWidth="2" />
      {/* Chasis inferior amarillo */}
      <rect x="30" y="200" width="140" height="24" rx="4" fill="#F5B800" stroke="#B8860B" strokeWidth="1.5" />
      {/* Contrapeso trasero (izquierda) */}
      <rect x="18" y="170" width="46" height="38" rx="4" fill="#1E3A8A" stroke="#0F172A" strokeWidth="1.5" />
      <rect x="24" y="178" width="34" height="4" rx="1" fill="#F5B800" />
      {/* Base rotatoria (plataforma superior) */}
      <rect x="60" y="188" width="110" height="14" rx="3" fill="#F5B800" stroke="#B8860B" strokeWidth="1.5" />
      {/* Cabina blanca */}
      <rect x="118" y="150" width="52" height="42" rx="5" fill="#F5F5F5" stroke="#4B5563" strokeWidth="1.5" />
      <rect x="124" y="156" width="40" height="20" rx="2" fill="#4B5563" />
      <rect x="126" y="158" width="16" height="8" rx="1" fill="#93C5FD" opacity="0.7" />
      <rect x="145" y="158" width="16" height="8" rx="1" fill="#93C5FD" opacity="0.7" />
      {/* Escalera cabina */}
      <line x1="118" y1="192" x2="112" y2="220" stroke="#4B5563" strokeWidth="2" />
      <line x1="115" y1="200" x2="120" y2="200" stroke="#4B5563" strokeWidth="1.5" />
      <line x1="114" y1="208" x2="119" y2="208" stroke="#4B5563" strokeWidth="1.5" />
      {/* Mástil vertical amarillo (grande, con perforaciones) */}
      <rect x="82" y="20" width="26" height="170" rx="3" fill="#F5B800" stroke="#B8860B" strokeWidth="1.5" />
      {/* Perforaciones/agujeros del mástil */}
      {[36, 60, 84, 108, 132, 156].map(y => (
        <circle key={y} cx="95" cy={y} r="4" fill="#0F172A" />
      ))}
      {/* Detalles laterales del mástil */}
      <line x1="82" y1="50" x2="82" y2="180" stroke="#B8860B" strokeWidth="1" />
      <line x1="108" y1="50" x2="108" y2="180" stroke="#B8860B" strokeWidth="1" />
      {/* Polea superior */}
      <rect x="76" y="12" width="38" height="14" rx="3" fill="#F5B800" stroke="#B8860B" strokeWidth="1.5" />
      <circle cx="95" cy="19" r="5" fill="#4B5563" stroke="#0F172A" strokeWidth="1.5" />
      <circle cx="95" cy="19" r="2" fill="#F5B800" />
      {/* Cable que baja */}
      <line x1="95" y1="26" x2="95" y2="90" stroke="#1F2937" strokeWidth="1.5" />
      {/* Kelly bar (barra telescópica colgando) */}
      <rect x="90" y="90" width="10" height="80" rx="1" fill="#6B7280" stroke="#1F2937" strokeWidth="1.5" />
      <line x1="90" y1="110" x2="100" y2="110" stroke="#1F2937" strokeWidth="0.8" />
      <line x1="90" y1="130" x2="100" y2="130" stroke="#1F2937" strokeWidth="0.8" />
      <line x1="90" y1="150" x2="100" y2="150" stroke="#1F2937" strokeWidth="0.8" />
      {/* Punta de la broca (auger) */}
      <polygon points="88,170 102,170 95,182" fill="#4B5563" stroke="#0F172A" strokeWidth="1.5" />
      {/* Suelo (línea sutil) */}
      <ellipse cx="100" cy="252" rx="90" ry="4" fill="#0F172A" opacity="0.08" />
    </svg>
  );

  return <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", height: "100vh", fontFamily: "inherit", background: BEIGE, color: CHARCOAL }}>
    {/* HERO — logo Geotecnica + titulo + ilustracion cartoon de piloteadora */}
    <div style={{
      position: "relative",
      minHeight: isMobile ? 120 : 180,
      flexShrink: 0,
      background: "linear-gradient(135deg, #E0EAF4 0%, #F3F6FA 100%)",
      borderBottom: `1px solid #E2E8F0`,
      padding: isMobile ? "14px 16px" : "24px 32px",
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
    }}>
      {/* Botones arriba a la derecha */}
      <div style={{ position: "absolute", top: isMobile ? 8 : 14, right: isMobile ? 12 : 24, display: "flex", gap: 8, zIndex: 3 }}>
        {onBack && <button onClick={onBack} style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8, color: CHARCOAL, padding: isMobile ? "5px 9px" : "7px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>← Volver al panel</button>}
        {onLogout && <button onClick={onLogout} style={{ background: "#fff", border: "1px solid #E5B4A9", borderRadius: 8, color: "#B23A26", padding: isMobile ? "5px 9px" : "7px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>Cerrar sesion</button>}
      </div>

      {/* Row principal */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: isMobile ? 12 : 28,
        width: "100%",
        flexDirection: isMobile ? "row" : "row",
      }}>
        {/* IZQUIERDA — logo Geotecnica */}
        <div style={{ flexShrink: 0, width: isMobile ? 90 : 200, display: "flex", alignItems: "center", justifyContent: isMobile ? "flex-start" : "center" }}>
          <img
            src={logoUrl}
            alt="Geotecnica Soluciones"
            style={{ height: isMobile ? 40 : 65, width: "auto", objectFit: "contain", display: "block" }}
          />
        </div>

        {/* CENTRO — texto */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <div style={{ fontSize: isMobile ? 10 : 11, letterSpacing: 2, color: ORANGE_DARK, fontWeight: 700, textTransform: "uppercase" }}>Grupo Geotecnica</div>
          <h1 style={{ margin: 0, fontSize: isMobile ? 18 : 28, fontWeight: 800, color: CHARCOAL, letterSpacing: -0.5, lineHeight: 1.15 }}>
            Maquinas — Solicitudes de Pago
          </h1>
          {!isMobile && <div style={{ fontSize: 13, color: STONE, fontWeight: 500 }}>
            Repuestos y mantenimiento por proyecto
          </div>}
          {/* Badge de usuario en mobile va debajo */}
          {isMobile && userName && (
            <div style={{ marginTop: 4, display: "inline-flex", background: BEIGE, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "3px 8px", alignSelf: "flex-start", fontSize: 10, color: CHARCOAL, fontWeight: 700 }}>
              {userName} · {roleLabel}
            </div>
          )}
        </div>

        {/* DERECHA — ilustracion de piloteadora (solo desktop) */}
        {!isMobile && (
          <div style={{ flexShrink: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", height: 180, marginRight: 8 }}>
            <PiloteadoraSVG height={170} />
          </div>
        )}

        {/* Badge del usuario en desktop */}
        {!isMobile && (
          <div style={{ background: BEIGE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "8px 14px", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
            <div style={{ fontSize: 13, color: CHARCOAL, fontWeight: 700, letterSpacing: 0.2 }}>{userName || "Usuario"}</div>
            <div style={{ fontSize: 11, color: ORANGE_DARK, fontWeight: 600 }}>{roleLabel}</div>
          </div>
        )}
      </div>
    </div>

    {/* TOPNAV horizontal */}
    <div style={{
      display: "flex",
      background: CREAM,
      borderBottom: `1px solid ${BORDER}`,
      overflowX: "auto",
      whiteSpace: "nowrap",
      flexShrink: 0,
      paddingLeft: isMobile ? 8 : 24,
      scrollbarWidth: "thin",
    }}>
      {visibleNav.map(n => {
        const active = sec === n.id;
        return <button
          key={n.id}
          onClick={() => setSec(n.id)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: isMobile ? "12px 16px" : "14px 22px",
            background: "transparent",
            border: "none",
            borderBottom: active ? `3px solid ${ORANGE}` : "3px solid transparent",
            color: active ? CHARCOAL : STONE,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: active ? 700 : 500,
            fontFamily: "inherit",
            transition: "all .15s",
            whiteSpace: "nowrap",
            marginBottom: -1,
          }}
          onMouseEnter={e => { if (!active) e.currentTarget.style.color = CHARCOAL; }}
          onMouseLeave={e => { if (!active) e.currentTarget.style.color = STONE; }}
        >
          <span style={{ fontSize: 16 }}>{n.icon}</span>
          <span>{n.label}</span>
        </button>;
      })}
    </div>

    {/* CONTENIDO */}
    <div style={{ flex: 1, overflow: "auto", background: BEIGE }}>
      <div style={{ padding: isMobile ? "12px 16px" : "20px 32px 8px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: isMobile ? 18 : 22, fontWeight: 800, color: CHARCOAL, letterSpacing: -0.3 }}>
            {sec === "dashboard" ? "Dashboard gerencial — Maquinas"
              : sec === "resumen" ? "Command Center — Seguimiento por proyecto"
              : sec === "projects" ? "Proyectos"
              : sec === "providers" ? "Proveedores"
              : sec === "machines" ? "Maquinas registradas"
              : sec === "costos" ? "Costos de maquinaria"
              : sec === "coordinar" ? "Por coordinar con proveedores"
              : sec === "entregas" ? "Entregas de proveedor"
              : sec === "conta" ? "Por cerrar contablemente"
              : sec === "cerradas" ? "Cerradas contablemente"
              : "Solicitudes de pago — Maquinas"}
          </h2>
          <span style={{ fontSize: 13, color: cc.accent, fontWeight: 600, letterSpacing: 0.3 }}>{cc.name}</span>
        </div>
        <Badge color={cc.color}>{cp.length} solicitudes</Badge>
      </div>
      <div style={{ padding: isMobile ? "8px 14px 20px 14px" : "12px 32px 28px 32px" }}>{
        sec === "dashboard" ? renderDashboard()
          : sec === "resumen" ? renderResumen()
          : sec === "projects" ? renderProjects()
          : sec === "providers" ? renderProviders()
          : sec === "machines" ? renderMachines()
          : sec === "costos" ? (canSeeCostosMaq ? renderCostosMaq() : null)
          : sec === "coordinar" ? renderCoordinar()
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
  </div>;
}

const TH = { padding: "10px 14px", textAlign: "left", color: "#475569", fontWeight: 700, borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 };
const TD = { padding: "10px 14px", color: "#334155", whiteSpace: "nowrap", fontSize: 13 };
