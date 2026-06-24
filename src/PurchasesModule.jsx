import { useState, useEffect, useRef } from "react";
import { store } from "./supabase.js";
import Logo from "./Logo.jsx";
import { PROJECTS as CANONICAL_PROJECTS } from "./projects.js";

// Marca Geotecnica
const ORANGE = "#E8762D";
const ORANGE_DARK = "#C75F1F";
const BEIGE = "#F5F0E8";
const CREAM = "#FFFBF5";
const DARK_BG = "#1F1B17";
const DARK_BORDER = "#3D3530";
const CHARCOAL = "#2C2A28";
const BORDER = "#DBD4C8";

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

  const openFile = () => {
    if (!file) return;
    if (file.type?.startsWith("image/") || file.type === "application/pdf") {
      const w = window.open();
      if (w) {
        w.document.write(`<!DOCTYPE html><html><head><title>${file.name}</title></head><body style='margin:0;background:#222;display:flex;align-items:center;justify-content:center;min-height:100vh'>` +
          (file.type === "application/pdf"
            ? `<iframe src='${file.dataUrl}' style='width:100vw;height:100vh;border:none'></iframe>`
            : `<img src='${file.dataUrl}' style='max-width:100vw;max-height:100vh'/>`) +
          `</body></html>`);
      }
    } else {
      // Trigger download for Excel/Word/etc
      const a = document.createElement("a");
      a.href = file.dataUrl;
      a.download = file.name;
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
      <Btn small variant="info" onClick={openFile}>Ver / Descargar</Btn>
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

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const PW = 297, PH = 210, M = 14, CW = PW - 2 * M; // util: 269mm ancho

  const today = new Date().toLocaleDateString("es-HN", { day: "2-digit", month: "long", year: "numeric" });
  const projFull = projectObj ? `${projectObj.short} — ${projectObj.name}` : (purchase.projectCode || "—");
  const fileName = `Ficha-Recibido-${purchase.projectCode}-${(purchase.provider || "").replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
  const hasQuotePDF = purchase.quoteFile?.dataUrl && purchase.quoteFile.type === "application/pdf";
  const hasQuoteImg = purchase.quoteFile?.dataUrl && purchase.quoteFile.type?.startsWith("image/");
  const hasReceiptPDF = purchase.receiptFile?.dataUrl && purchase.receiptFile.type === "application/pdf";
  const hasReceiptImg = purchase.receiptFile?.dataUrl && purchase.receiptFile.type?.startsWith("image/");
  const hasAnyPDFAttachment = hasQuotePDF || hasReceiptPDF;

  // Paleta
  const B  = [15, 76, 117], BL = [239, 246, 255];   // azul
  const G  = [5, 150, 105],  GL = [220, 252, 231];   // verde
  const GR = [71, 85, 105],  GL2 = [248, 250, 252];  // gris
  const DK = [30, 41, 59],  BD = [203, 213, 225];     // dark / borde
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

  fc(B); rc(M, y, 11, 22, "F");
  f(11, "bold"); tc(W); doc.text("GT", M + 2, y + 13);

  f(15, "bold"); tc(B); doc.text("GRUPO GEOTECNICA", M + 14, y + 8);
  f(9, "normal"); tc(GR); doc.text(companyName || "Geotecnica Soluciones", M + 14, y + 14);

  fc(B); rc(PW / 2 - 44, y, 88, 22, "F");
  f(10.5, "bold"); tc(W); doc.text("FICHA DE RECIBIDO DE MATERIALES", PW / 2, y + 13, { align: "center" });

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

  y += 25; dc(B); lw(0.6); ln(M, y, PW - M, y); y += 4;

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
  // 3. DOS COLUMNAS: A llenar en campo | Verificacion  (y: 83 → 153)
  // ════════════════════════════════════════════════════════
  const fillY = y, fillH = 66, divX = M + 168;

  // Fondos
  fc(GL2); rc(M, y, divX - M, fillH, "F");
  fc([240, 253, 244]); rc(divX, y, M + CW - divX, fillH, "F");

  // Barras de titulo de columna
  fc(B); rc(M, y, 3, fillH, "F");
  fc(G); rc(divX, y, 3, fillH, "F");
  f(7.5, "bold"); tc(B); doc.text("A COMPLETAR EN CAMPO", M + 5, y + 5.5);
  tc(G); doc.text("VERIFICACION", divX + 6, y + 5.5);

  // Linea divisora entre columnas
  dc(BD); lw(0.25); ln(divX, y, divX, y + fillH);

  // ── Columna izquierda: campos a llenar ──
  const Fx = M + 6, Fw = divX - M - 10;
  const FH = (Fw - 5) / 2;
  let fy = y + 12;

  // Fecha | Hora (en la misma fila)
  lbl("Fecha de recibido", Fx, fy); lbl("Hora", Fx + FH * 0.7 + 5, fy);
  fy += 3; blk(Fx, fy + 3, FH * 0.65); blk(Fx + FH * 0.7 + 5, fy + 3, FH * 0.28); fy += 9;

  // Nombre
  lbl("Nombre completo de quien recibe", Fx, fy);
  fy += 3; blk(Fx, fy + 3, Fw); fy += 9;

  // Cargo
  lbl("Cargo", Fx, fy);
  fy += 3; blk(Fx, fy + 3, Fw); fy += 9;

  // Lugar
  lbl("Lugar de entrega / Bodega / Proyecto", Fx, fy);
  fy += 3; blk(Fx, fy + 3, Fw); fy += 9;

  // N° Factura
  lbl("N° de factura del proveedor", Fx, fy);
  fy += 3; blk(Fx, fy + 3, Fw * 0.6); fy += 9;

  // Observaciones
  lbl("Observaciones", Fx, fy);
  fy += 2; dc(BD); lw(0.2); rc(Fx, fy, Fw, 10, "S");

  // ── Columna derecha: verificacion ──
  const Vx = divX + 7;
  const chks = [
    "Materiales completos y en buen estado",
    "Cantidades correctas segun cotizacion",
    "Conforme con la descripcion aprobada",
    "Factura del proveedor recibida",
    "Entrega parcial — pendiente: ___________",
  ];
  let cy = fillY + 13;
  chks.forEach(t => {
    cbx(Vx, cy - 3);
    f(9.5, "normal"); tc(DK); doc.text(t, Vx + 6, cy);
    cy += 11;
  });

  y = fillY + fillH + 5;

  // ════════════════════════════════════════════════════════
  // 4. FIRMAS (2 bloques)  (y: ~154 → 188)
  // ════════════════════════════════════════════════════════
  const sigW = (CW - 8) / 2;
  [
    ["", "Nombre y Firma — Quien Recibe el Material"],
    ["Visto Bueno", "Coordinacion de Operaciones"],
  ].forEach(([top, bot], i) => {
    const sx = M + i * (sigW + 8);
    dc(BK); lw(0.4); ln(sx, y + 20, sx + sigW, y + 20);
    if (top) { f(9, "bold"); tc(DK); doc.text(top, sx + sigW / 2, y + 25, { align: "center", maxWidth: sigW }); }
    f(8, "normal"); tc(GR); doc.text(bot, sx + sigW / 2, y + (top ? 30 : 25), { align: "center", maxWidth: sigW });
  });
  y += 35;

  // Footer
  dc(BD); lw(0.25); ln(M, y, PW - M, y); y += 4;
  f(7, "normal"); tc([148, 163, 184]);
  doc.text(`Grupo Geotecnica · Ficha de Recibido · ${today} · Proy: ${purchase.projectCode} · ${purchase.provider} · ID: ${purchase.id}`, PW / 2, y, { align: "center" });

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
  const { PDFDocument } = await import("pdf-lib");
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
function PurchaseFormImpl({ purchase, co, userName, setModal, getProject, allProjects, purchases, providers, addAudit, saveOrAlert }) {
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState(purchase || {
    company: co, projectCode: "", provider: "", description: "",
    amount: "", quoteNumber: "", opsResponsible: userName || "",
    opsNotes: "", bacAccount: "", providerBank: "", providerAccountType: "", providerAccountHolder: "", providerRTN: "", quoteFile: null, receiptFile: null,
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
          onChange={e => {
            const newName = e.target.value;
            u("provider", newName);
            // Si matchea exactamente un proveedor conocido, auto-fill su primera cuenta + datos
            const match = (providers || []).find(p => (p.name || "").trim().toLowerCase() === newName.trim().toLowerCase());
            if (match && match.bankAccounts?.length > 0) {
              const bac = match.bankAccounts.find(b => /bac/i.test(b.bank || "")) || match.bankAccounts[0];
              if (bac) {
                if (!f.bacAccount && bac.number) u("bacAccount", bac.number);
                if (!f.providerBank && bac.bank) u("providerBank", bac.bank);
                if (!f.providerAccountType && bac.type) u("providerAccountType", bac.type);
                if (!f.providerAccountHolder && bac.holder) u("providerAccountHolder", bac.holder);
              }
              if (!f.providerRTN && match.rtn) u("providerRTN", match.rtn);
            }
          }}
          placeholder="Escribe o elige de la lista"
        />
        <datalist id="providers-datalist">
          {(providers || []).map(p => <option key={p.id} value={p.name} />)}
        </datalist>
      </div>
      <Input label="N° de Cotizacion" value={f.quoteNumber} onChange={e => u("quoteNumber", e.target.value)} placeholder="Ej: COT-2026-0123" />
      <div style={{ gridColumn: "1/-1" }}>
        <Textarea label="Descripcion de la compra" value={f.description} onChange={e => u("description", e.target.value)} placeholder="Detalle del bien o servicio a adquirir" />
      </div>
      <Input label="Monto total (Lempiras)" type="number" step="0.01" value={f.amount} onChange={e => u("amount", e.target.value)} placeholder="0.00" />
      <Input label="Responsable de Operaciones" value={f.opsResponsible} onChange={e => u("opsResponsible", e.target.value)} placeholder="Quien valida por Operaciones" />

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
            const rec = { ...f, id: f.id || uid(), status: "borrador", treasuryStatus: null };
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
            const rec = { ...f, id: f.id || uid(), status: "validado", treasuryStatus: "pendiente", validatedAt: new Date().toISOString() };
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
// SendPickupFormImpl: form para enviar una compra a Logistica como orden
// de recogida. Ana lo usa despues de hablar con el proveedor.
// ─────────────────────────────────────────────────────────────────────────
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
export default function PurchasesModule({ userRole, userName, onBack, onLogout }) {
  const isAdmin = userRole === "admin";
  const isTesoreria = userRole === "tesoreria";
  const isGerencia = userRole === "gerencia";
  const isCostos = userRole === "costos";
  const isRecepcion = userRole === "recepcion";
  const isAsistenteCompras = userRole === "asistente_compras";

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
  const canViewOnly = isGerencia;                                                 // solo gerencia es read-only
  const canEditDelivery = isAdmin || isCostos || isRecepcion;                     // subir/editar fichas de recibido
  const canManageProviders = isAdmin || isCostos || isAsistenteCompras || isRecepcion;  // CRUD de proveedores (Ana primaria, Jorge tambien para no quedar trabados)
  const canSendToLogistics = isAdmin || isCostos || isAsistenteCompras;           // crear orden de recogida desde compra pagada

  const [co, setCo] = useState("geotecnica");
  const [purchases, setPurchases] = useState([]);
  const [customProjects, setCustomProjects] = useState([]);
  const [providers, setProviders] = useState([]);
  const [despachos, setDespachos] = useState([]); // shared con LogisticsModule — para saber si una compra ya tiene orden de recogida
  const [loaded, setLoaded] = useState(false);
  const [modal, setModal] = useState(null);
  const [sb, setSb] = useState(true);
  // Default section depende del rol:
  // - Ana (asistente_compras) → su vista "ana" (Por coordinar)
  // - Jorge (recepcion) → "list" (para subir fichas)
  // - Resto → "list" (solicitudes normales)
  const defaultSec = isAsistenteCompras ? "ana" : "list";
  const [sec, setSec] = useState(defaultSec);
  const [filter, setFilter] = useState({ status: "", project: "", provider: "", from: "", to: "" });
  // Estado de expansion/colapso de sub-secciones en el Kanban de Ana.
  // Keys: `${projectKey}-enlog`, `${projectKey}-cierre`, `${projectKey}-cerradas`.
  // Default: enlog y cierre abiertas (undefined → tratado como true), cerradas oculto.
  const [anaExpand, setAnaExpand] = useState({});
  // Estado del Command Center (Resumen). showCompleted: incluir cerradas.
  // projectCode: filtrar a un solo proyecto.
  const [resumenFilter, setResumenFilter] = useState({ showCompleted: false, projectCode: "" });

  useEffect(() => {
    (async () => {
      const [p, cps, prov, desp] = await Promise.all([
        store.get("cp-purchases"),
        store.get("cp-projects"),
        store.get("cp-providers"),
        store.get("lg-despachos"),
      ]);
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
    })();
  }, []);

  // Auto-refresh al volver a la pestaña — si Carolina subio un comprobante mientras
  // admin/Christian/Ana estaban en otra tab, al volver ven el cambio sin recargar.
  useEffect(() => {
    const refreshFromCloud = async () => {
      try {
        const [p, desp] = await Promise.all([
          store.get("cp-purchases"),
          store.get("lg-despachos"),
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
        if (Array.isArray(desp)) setDespachos(desp);
      } catch (e) {
        console.warn("[Compras] Auto-refresh fallo:", e?.message || e);
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

      // 1) PRE-FETCH cloud: si otro usuario/tab agrego solicitudes mientras estabamos
      // editando, las traemos para no pisarlas.
      const cloudPrevia = await store.get("cp-purchases");
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

      // 4) Save archivos serial
      const failedFiles = [];
      for (const f of filesToSave) {
        const ok = await store.set(fileKey(f.fileId), f.content);
        if (!ok) failedFiles.push(f);
      }

      // 5) Save cp-purchases (con merge)
      const purchasesOk = await store.set("cp-purchases", light);
      console.log("☁️ Save cp-purchases →", purchasesOk ? "OK" : "FAIL");

      // 6) VERIFICACION: re-fetch desde cloud y comparar
      let verifiedOk = true;
      let verifiedCount = null;
      if (purchasesOk) {
        try {
          const verify = await store.get("cp-purchases");
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
  const sCP = d => { setCustomProjects(d); store.set("cp-projects", d); };

  // ── CRUD de Proveedores ──
  const saveProviders = async (next) => {
    setProviders(next);
    return await store.set("cp-providers", next);
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
  const removePurchase = (id) => sP(purchases.filter(p => p.id !== id));
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

  if (!loaded) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'Segoe UI', sans-serif", color: "#64748b" }}>Cargando Compras-Operaciones...</div>;

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
      const rec = {
        ...p,
        deliveryStatus: newStatus || p.deliveryStatus || "pendiente_entrega",
        delivery: { ...newDf, updatedAt: new Date().toISOString() },
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
          <div><div style={{ fontSize: 11, color: "#64748b" }}>Fecha de carga</div><div style={{ fontWeight: 600 }}>{fmt(p.createdAt)}</div></div>
          <div><div style={{ fontSize: 11, color: "#64748b" }}>Proveedor</div><div style={{ fontWeight: 600 }}>{p.provider}</div></div>
          <div><div style={{ fontSize: 11, color: "#64748b" }}>N° Cotizacion</div><div style={{ fontWeight: 600 }}>{p.quoteNumber || "—"}</div></div>
          <div><div style={{ fontSize: 11, color: "#64748b" }}>Responsable Ops</div><div style={{ fontWeight: 600 }}>{p.opsResponsible || "—"}</div></div>
          <div><div style={{ fontSize: 11, color: "#64748b" }}>Validado</div><div style={{ fontWeight: 600 }}>{fmtDT(p.validatedAt)}</div></div>
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
        🏢 <b>{providers.length} proveedores registrados.</b> Cada compra que se crea con un proveedor nuevo se agrega aqui automaticamente para que <b>{isAsistenteCompras ? "vos completes" : "Ana complete"}</b> los datos (telefonos, cuentas bancarias, contacto). En la nueva solicitud aparecen como dropdown.
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
    else if (isPaid && hasReceipt && !hasDesp) { nextAction = "Coordinar con proveedor + enviar a logistica"; nextOwner = "Ana Vasquez"; }
    else if (hasDesp && !hasVehicle && desp?.estado === "pendiente") { nextAction = "Asignar vehiculo + motorista"; nextOwner = "Oscar Paz"; }
    else if (hasVehicle && !enRuta && !entregado) { nextAction = "Salir en ruta"; nextOwner = "Oscar Paz"; }
    else if (enRuta) { nextAction = "Entregar en proyecto"; nextOwner = "Motorista"; }
    else if (entregado && !fichaUploaded) { nextAction = "Subir ficha de recibido firmada"; nextOwner = "Jorge Castellanos"; }
    else if (fichaUploaded) { nextAction = "✓ Lista — pasar a contabilidad"; nextOwner = ""; }

    return {
      desp, isPaid, hasReceipt, hasDesp, hasVehicle, enRuta, entregado, fichaUploaded, lista,
      nextAction, nextOwner,
    };
  };

  // Render de la barra de fases (8 hitos) para una compra. Sacamos "Cerrada
  // contablemente" porque eso lo maneja Ana sola con contabilidad — el
  // coordinador no necesita visibilidad de ese ultimo paso.
  const renderLifecycleBar = (p, lc) => {
    const phases = [
      { key: "solicitud",  emoji: "📝", label: "Solicitud",      done: true },
      { key: "validado",   emoji: "✅", label: "Validada",       done: ["validado","pagado","finalizado"].includes(p.status) },
      { key: "pagado",     emoji: "💰", label: "Pagada",         done: lc.isPaid },
      { key: "compr",      emoji: "🧾", label: "Comprobante",    done: lc.hasReceipt },
      { key: "coord",      emoji: "📞", label: "Coordinada Ana", done: lc.hasDesp },
      { key: "logistica",  emoji: "🚛", label: "Logistica",      done: lc.hasVehicle },
      { key: "entreg",     emoji: "📦", label: "Entregada",      done: lc.entregado },
      { key: "ficha",      emoji: "📋", label: "Ficha firmada",  done: lc.fichaUploaded },
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

  const renderResumen = () => {
    // Filtros del Command Center
    // - showCompleted: incluir las "listas" (ficha subida o cerradas).
    //   Por default ocultas — el coordinador solo ve lo que tiene accion pendiente.
    const showCompleted = resumenFilter.showCompleted;
    const projFilter = resumenFilter.projectCode;

    // Agrupar compras por proyecto, filtrando segun company actual
    const grupos = {};
    cp.forEach(p => {
      // Una compra esta "lista" cuando Jorge subio la ficha o cuando Ana cerro.
      // De ahi en adelante no necesita visibilidad del coordinador.
      const lista = !!p.delivery?.fichaFile || p.deliveryStatus === "cerrado";
      if (!showCompleted && lista) return;
      if (projFilter && p.projectCode !== projFilter) return;
      const key = p.projectCode || "_sin_proyecto";
      (grupos[key] = grupos[key] || []).push(p);
    });

    const proyectosConCompras = Object.keys(grupos).sort();

    if (proyectosConCompras.length === 0) {
      return (
        <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>📊</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#475569" }}>
            {showCompleted ? "No hay compras para mostrar" : "✓ Todo al dia — no hay acciones pendientes"}
          </div>
          {!showCompleted && <div style={{ marginTop: 8, fontSize: 13 }}>Activa "Mostrar listas" para ver las compras donde Jorge ya subio la ficha.</div>}
        </div>
      );
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Filtros */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, color: CHARCOAL }}>
            <input type="checkbox" checked={showCompleted} onChange={e => setResumenFilter(s => ({ ...s, showCompleted: e.target.checked }))} />
            Mostrar listas (ya con ficha)
          </label>
          <div style={{ height: 20, width: 1, background: "#E2E8F0" }} />
          <Select
            label=""
            options={[{ value: "", label: "Todos los proyectos" }, ...allProjects.map(p => ({ value: p.short, label: p.short }))]}
            value={projFilter}
            onChange={e => setResumenFilter(s => ({ ...s, projectCode: e.target.value }))}
            emptyLabel="Todos los proyectos"
          />
          <div style={{ marginLeft: "auto", fontSize: 12, color: "#64748b", fontWeight: 600 }}>
            {proyectosConCompras.length} proyectos · {Object.values(grupos).reduce((a, l) => a + l.length, 0)} compras
          </div>
        </div>

        {/* Leyenda */}
        <div style={{ background: "#F8FAFC", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 12px", display: "flex", gap: 16, fontSize: 11, color: "#64748b", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontWeight: 700, color: CHARCOAL }}>Leyenda:</span>
          <span><span style={{ display: "inline-block", width: 12, height: 12, background: "#059669", borderRadius: 2, verticalAlign: "middle", marginRight: 4 }} />Completado</span>
          <span><span style={{ display: "inline-block", width: 12, height: 12, background: "#F59E0B", borderRadius: 2, verticalAlign: "middle", marginRight: 4, border: "2px solid #D97706" }} />Siguiente accion</span>
          <span><span style={{ display: "inline-block", width: 12, height: 12, background: "#E2E8F0", borderRadius: 2, verticalAlign: "middle", marginRight: 4 }} />Pendiente</span>
          <span style={{ marginLeft: "auto", fontStyle: "italic" }}>Click una compra para abrir el detalle completo</span>
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
            <div key={key} style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
              {/* Header del proyecto */}
              <div style={{ padding: "14px 18px", background: projColor + "15", borderBottom: `2px solid ${projColor}40`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: projColor, fontFamily: "ui-monospace, Menlo, monospace", letterSpacing: 0.3 }}>{key}</div>
                  {projName && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{projName}</div>}
                </div>
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#059669" }}>{fmtL(totalMonto)}</div>
                    <div style={{ fontSize: 10, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.5 }}>{items.length} compras</div>
                  </div>
                </div>
              </div>

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

                      {/* Siguiente accion */}
                      <div style={{ minWidth: 0 }}>
                        {lc.lista ? (
                          <div style={{ fontSize: 11, color: "#059669", fontWeight: 700 }}>✓ Lista — pasar a contabilidad</div>
                        ) : (
                          <>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#9A4F1D", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lc.nextAction}</div>
                            {lc.nextOwner && <div style={{ fontSize: 10, color: "#64748b", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>→ {lc.nextOwner}</div>}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ANA KANBAN — Compras pagadas pendientes de coordinar retiro con proveedor
  // ─────────────────────────────────────────────────────────────────────────
  const renderAnaKanban = () => {
    // Clasificacion de cada compra pagada en una de 3 sub-secciones por proyecto.
    // El mismo ID de compra vive en una sola sub-seccion segun su estado actual.
    //
    // FLUJO (simplificado — el cierre contable lo maneja Ana fuera del sistema):
    //   por_coordinar  → pagada, sin despacho
    //   en_logistica   → tiene despacho pendiente/programado/en_ruta/entregado sin ficha
    //   listas         → Jorge ya subio la ficha de recibido (informativo, sin accion)
    const yaTieneDespacho = (purchaseId) => despachos.some(d => d.sourcePurchaseId === purchaseId);
    const despachoDe = (purchaseId) => despachos.find(d => d.sourcePurchaseId === purchaseId);

    // Para cada compra pagada, decidir en que sub-seccion va
    const clasificar = (p) => {
      if (p.status !== "pagado" && p.status !== "finalizado") return null;
      // ficha_adjunta o cerrada legacy → "listas" (informativo, no se actua mas aqui)
      if (p.deliveryStatus === "ficha_adjunta" || p.deliveryStatus === "cerrado") return "listas";
      const d = despachoDe(p.id);
      if (d && (d.estado === "pendiente" || d.estado === "programado" || d.estado === "en_ruta" || d.estado === "entregado")) {
        // Entregado pero sin ficha aun: sigue en logistica
        return "en_logistica";
      }
      // No tiene despacho — Ana tiene que coordinar
      return "por_coordinar";
    };

    // Agrupar por proyecto, dentro de cada proyecto por sub-seccion
    const grupos = {};
    const ensure = (key) => { if (!grupos[key]) grupos[key] = { por_coordinar: [], en_logistica: [], listas: [] }; };
    let totales = { por_coordinar: 0, en_logistica: 0, listas: 0 };
    cp.forEach(p => {
      const bucket = clasificar(p);
      if (!bucket) return;
      const key = p.projectCode || "__sin__";
      ensure(key);
      grupos[key][bucket].push(p);
      totales[bucket]++;
    });

    // Proyectos a mostrar: los que tienen al menos una compra en cualquiera de las 3 sub-secciones
    const projKeys = Object.keys(grupos).sort((a, b) => {
      if (a === "__sin__") return 1;
      if (b === "__sin__") return -1;
      // Ordenar primero por cantidad de items activos (por_coordinar es donde Ana debe actuar)
      const aActive = grupos[a].por_coordinar.length;
      const bActive = grupos[b].por_coordinar.length;
      if (aActive !== bActive) return bActive - aActive;
      return a.localeCompare(b);
    });

    // Helpers de renderizado para cada sub-seccion (cards mas compactas para historico)
    const renderCardCompacta = (p, opts = {}) => {
      const provider = findProviderByName(p.provider);
      const d = despachoDe(p.id);
      return <div key={p.id} style={{
        background: "#fff",
        border: `1px solid ${opts.borderColor || "#E2E8F0"}`,
        borderLeft: `3px solid ${opts.accentColor || "#94A3B8"}`,
        borderRadius: 8,
        padding: 10,
        opacity: opts.faded ? 0.85 : 1,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          {opts.badge && <Badge color={opts.accentColor}>{opts.badge}</Badge>}
          {opts.dateRight && <span style={{ fontSize: 9, color: "#64748b", fontWeight: 700 }}>{opts.dateRight}</span>}
        </div>
        <div style={{ fontSize: 12, fontWeight: 800, color: CHARCOAL, marginTop: 2, textDecoration: opts.strike ? "line-through" : "none", textDecorationColor: opts.accentColor }}>{p.provider}</div>
        <div style={{ fontSize: 11, color: "#475569", marginTop: 2, lineHeight: 1.4, textDecoration: opts.strike ? "line-through" : "none", textDecorationColor: opts.accentColor }}>{p.description}</div>
        {p.amount && <div style={{ fontSize: 10, color: opts.accentColor || "#059669", fontWeight: 700, marginTop: 3 }}>L {Number(p.amount).toLocaleString("es-HN", { minimumFractionDigits: 2 })}</div>}
        {opts.subline && <div style={{ fontSize: 10, color: opts.accentColor || "#64748b", marginTop: 4, paddingTop: 4, borderTop: "1px dashed #E2E8F0" }}>{opts.subline}</div>}
        {opts.actions}
      </div>;
    };

    // Card grande para "por coordinar" — incluye contacto provider y botones
    const renderCardPorCoordinar = (p) => {
      const provider = findProviderByName(p.provider);
      return <div key={p.id} style={{
        background: "#fff",
        border: "1px solid #FDBA74",
        borderLeft: "3px solid #E8762D",
        borderRadius: 8,
        padding: 12,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <Badge color="#E8762D">📦 Por coordinar</Badge>
          {p.paidAt && <span style={{ fontSize: 9, color: "#64748b", fontWeight: 700 }}>Pagado {new Date(p.paidAt).toLocaleDateString("es-HN", { day: "2-digit", month: "short" })}</span>}
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, color: CHARCOAL, marginTop: 4 }}>{p.provider}</div>
        <div style={{ fontSize: 12, color: "#475569", marginTop: 2, lineHeight: 1.4 }}>{p.description}</div>
        {p.amount && <div style={{ fontSize: 11, color: "#059669", fontWeight: 700, marginTop: 4 }}>L {Number(p.amount).toLocaleString("es-HN", { minimumFractionDigits: 2 })}</div>}
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed #E2E8F0", fontSize: 11, color: "#475569" }}>
          {provider?.phones?.length > 0 || provider?.contactName ? <>
            {provider.contactName && <div>👤 {provider.contactName}</div>}
            {provider.phones?.length > 0 && <div>📞 <a href={`tel:${provider.phones[0]}`} style={{ color: "#0891B2", textDecoration: "none", fontWeight: 700 }}>{provider.phones[0]}</a>{provider.phones.length > 1 && ` · +${provider.phones.length - 1}`}</div>}
          </> : <div style={{ fontStyle: "italic", color: "#F59E0B", fontSize: 10 }}>
            ⚠️ Sin info de contacto. <button onClick={() => { setSec("providers"); }} style={{ background: "none", border: "none", color: "#0891B2", textDecoration: "underline", cursor: "pointer", padding: 0, fontSize: 10 }}>Agregar</button>
          </div>}
        </div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          <button onClick={async () => { try { await generateFichaPDF(p, getProject(p.projectCode), COMPANIES[p.company]?.name); } catch (err) { alert("No se pudo generar la ficha: " + (err?.message || err)); } }} style={{ background: CHARCOAL, color: "#F0EBE3", border: "none", padding: "7px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>📄 Descargar Ficha de Entrega</button>
          {canSendToLogistics && <button onClick={() => setModal({ t: "send-pickup", d: p })} style={{ background: "#E8762D", color: "#fff", border: "none", padding: "9px 10px", borderRadius: 6, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.3 }}>🚛 Enviar a Logistica</button>}
        </div>
      </div>;
    };

    return <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Stats globales */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "14px 18px", minWidth: 150 }}>
          <div style={{ fontSize: 22 }}>📦</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#E8762D", marginTop: 4 }}>{totales.por_coordinar}</div>
          <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Por coordinar</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "14px 18px", minWidth: 150 }}>
          <div style={{ fontSize: 22 }}>🚛</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#0891B2", marginTop: 4 }}>{totales.en_logistica}</div>
          <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>En Logistica</div>
        </div>
        <div style={{ background: "#fff", border: totales.listas > 0 ? "1px solid #6EE7B7" : "1px solid #E2E8F0", borderRadius: 12, padding: "14px 18px", minWidth: 150 }}>
          <div style={{ fontSize: 22 }}>✓</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#059669", marginTop: 4 }}>{totales.listas}</div>
          <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Listas — pasar a contabilidad</div>
        </div>
      </div>

      <div style={{ background: "#FFFBEB", border: "1px solid #F59E0B", borderRadius: 12, padding: 14, fontSize: 13, color: "#78350F" }}>
        💼 <b>Flujo:</b> 📦 Por coordinar con proveedor → 🚛 En Logistica → ✓ Lista para contabilidad (cuando Jorge sube la ficha). El cierre contable lo manejas vos directamente con conta.
      </div>

      {/* Kanban por proyecto — cada columna tiene 4 sub-secciones colapsables */}
      {projKeys.length === 0
        ? <div style={{ background: "#F8FAFC", border: "1px dashed #CBD5E1", borderRadius: 12, padding: 60, textAlign: "center", color: "#94A3B8" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✨</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: CHARCOAL, marginBottom: 4 }}>Sin compras activas</div>
            <div style={{ fontSize: 13 }}>Cuando Lic. Carolina pague una solicitud, aparecera aca por proyecto.</div>
          </div>
        : <div style={{ display: "flex", gap: 14, overflowX: "auto", padding: "4px 4px 12px 4px" }}>
            {projKeys.map(key => {
              const items = grupos[key];
              const proj = (customProjects || []).find(p => p.short === key);
              const projDisplay = key === "__sin__" ? "SIN PROYECTO" : key;
              const projName = proj?.name || "";
              const colTotal = items.por_coordinar.length + items.en_logistica.length + items.listas.length;
              const headerColor = items.listas.length > 0 && items.por_coordinar.length === 0 && items.en_logistica.length === 0 ? "#059669" : items.por_coordinar.length > 0 ? "#E8762D" : "#0891B2";

              const expandedEnLog = anaExpand[`${key}-enlog`] !== false; // default visible
              const expandedCierre = anaExpand[`${key}-cierre`] !== false; // default visible

              const toggleSec = (subkey) => setAnaExpand(s => ({ ...s, [subkey]: !(s[subkey] !== false) }));

              return <div key={key} style={{
                minWidth: 310,
                maxWidth: 350,
                flex: "0 0 auto",
                background: "#F8F2E6",
                borderRadius: 12,
                padding: 14,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                border: "1px solid #E8E1D3",
              }}>
                {/* Header de proyecto */}
                <div style={{ borderBottom: `3px solid ${headerColor}`, paddingBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: CHARCOAL, fontFamily: "ui-monospace, Menlo, monospace", letterSpacing: 0.5 }}>{projDisplay}</div>
                    <Badge color={headerColor}>{colTotal}</Badge>
                  </div>
                  {projName && <div style={{ fontSize: 11, color: "#5C5853", marginTop: 4, lineHeight: 1.3 }}>{projName}</div>}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 720, overflowY: "auto" }}>
                  {/* Sub-seccion: POR COORDINAR (cards grandes activas) */}
                  {items.por_coordinar.length > 0 && <div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#9A4F1D", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, padding: "4px 8px", background: "#FFEFD9", borderRadius: 4 }}>
                      📦 Por coordinar ({items.por_coordinar.length})
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {items.por_coordinar
                        .sort((a, b) => (a.paidAt || "").localeCompare(b.paidAt || ""))
                        .map(renderCardPorCoordinar)}
                    </div>
                  </div>}

                  {/* Sub-seccion: EN LOGISTICA (colapsable, default abierto) */}
                  {items.en_logistica.length > 0 && <>
                    <button onClick={() => toggleSec(`${key}-enlog`)} style={{ background: "#DBEAFE", color: "#1E3A8A", border: "1px solid #93C5FD", padding: "6px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>🚛 En Logistica ({items.en_logistica.length})</span>
                      <span style={{ fontSize: 10 }}>{expandedEnLog ? "▾" : "▸"}</span>
                    </button>
                    {expandedEnLog && <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 4 }}>
                      {items.en_logistica
                        .sort((a, b) => (a.paidAt || "").localeCompare(b.paidAt || ""))
                        .map(p => {
                          const d = despachoDe(p.id);
                          const estCfg = { pendiente: { c: "#E8762D", l: "📌 Pendiente" }, programado: { c: "#3E6A99", l: "📅 Programado" }, en_ruta: { c: "#D4A017", l: "🚛 En ruta" }, entregado: { c: "#059669", l: "✓ Entregado (esperando ficha)" } }[d?.estado] || { c: "#64748b", l: d?.estado };
                          return renderCardCompacta(p, {
                            badge: estCfg.l,
                            accentColor: estCfg.c,
                            borderColor: "#BFDBFE",
                            dateRight: d?.fechaProgramada ? `📅 ${new Date(d.fechaProgramada + "T00:00").toLocaleDateString("es-HN", { day: "2-digit", month: "short" })}` : "",
                            subline: d?.motorista ? `🚛 ${d.motorista}` : null,
                            actions: <div style={{ marginTop: 6 }}>
                              <button onClick={async () => { try { await generateFichaPDF(p, getProject(p.projectCode), COMPANIES[p.company]?.name); } catch (e) { alert("No se pudo: " + e.message); } }} style={{ background: "transparent", color: CHARCOAL, border: "1px solid #CBD5E1", padding: "5px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", width: "100%" }}>📄 Ficha</button>
                            </div>,
                          });
                        })}
                    </div>}
                  </>}

                  {/* Sub-seccion: LISTAS PARA CONTABILIDAD (verde — informativo, sin accion) */}
                  {items.listas.length > 0 && <>
                    <button onClick={() => toggleSec(`${key}-cierre`)} style={{ background: "#DCFCE7", color: "#065F46", border: "2px solid #059669", padding: "8px 10px", borderRadius: 6, fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>✓ Listas para contabilidad ({items.listas.length})</span>
                      <span style={{ fontSize: 10 }}>{expandedCierre ? "▾" : "▸"}</span>
                    </button>
                    {expandedCierre && <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 4 }}>
                      {items.listas.map(p => {
                        const tieneFichaFirmada = !!p.delivery?.fichaFile?.fileId;
                        return renderCardCompacta(p, {
                          badge: "✓ Lista — pasar a conta",
                          accentColor: "#059669",
                          borderColor: "#6EE7B7",
                          dateRight: p.delivery?.fichaUploadedAt ? `Ficha ${new Date(p.delivery.fichaUploadedAt).toLocaleDateString("es-HN", { day: "2-digit", month: "short" })}` : "",
                          subline: p.delivery?.fichaFile?.name || "Ficha de recibido subida por Jorge",
                          actions: <div style={{ marginTop: 6 }}>
                            <button onClick={async () => {
                              // Si Jorge subio la ficha firmada, abrirla. Sino fallback al template (deberia ser raro).
                              if (tieneFichaFirmada) {
                                try {
                                  const ref = p.delivery.fichaFile;
                                  const full = await store.get(`cp-file-${ref.fileId}`);
                                  if (!full?.dataUrl) { alert("No se pudo cargar la ficha firmada desde la nube."); return; }
                                  const w = window.open();
                                  if (w) {
                                    w.document.write(
                                      full.type === "application/pdf"
                                        ? `<iframe src='${full.dataUrl}' style='width:100vw;height:100vh;border:none'></iframe>`
                                        : `<img src='${full.dataUrl}' style='max-width:100vw;max-height:100vh'/>`
                                    );
                                  }
                                } catch (e) { alert("Error abriendo ficha firmada: " + e.message); }
                              } else {
                                try { await generateFichaPDF(p, getProject(p.projectCode), COMPANIES[p.company]?.name); } catch (e) { alert("No se pudo: " + e.message); }
                              }
                            }} style={{ background: "#059669", color: "#fff", border: "none", padding: "7px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", width: "100%" }}>
                              👁 Ver ficha firmada
                            </button>
                          </div>,
                        });
                      })}
                    </div>}
                  </>}
                </div>
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
        {canCreate && <Btn variant="primary" onClick={() => setModal({ t: "new" })}>+ Nueva solicitud</Btn>}
        {!canCreate && canPay && <div style={{ fontSize: 12, color: "#64748b" }}>Click en una fila para revisar y gestionar el pago →</div>}
      </div>

      {/* Tabla */}
      <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid #E2E8F0", background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: "#F1F5F9" }}>
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
            {dataSorted.length === 0 && <tr><td colSpan={11} style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>
              {cp.length === 0 ? "Aun no hay solicitudes registradas para esta empresa." : "No hay resultados con los filtros aplicados."}
            </td></tr>}
            {dataSorted.map(p => <tr key={p.id} style={{ borderBottom: "1px solid #F1F5F9", cursor: "pointer" }} onClick={() => setModal({ t: "detail", d: p })}>
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
      case "new": return <Modal title="Nueva solicitud de compra" onClose={() => setModal(null)} wide><PurchaseFormImpl co={co} userName={userName} setModal={setModal} getProject={getProject} allProjects={allProjects} purchases={purchases} providers={providers} addAudit={addAudit} saveOrAlert={saveOrAlert} /></Modal>;
      case "edit": return <Modal title={`Editar solicitud — ${m.d.provider}`} onClose={() => setModal(null)} wide><PurchaseFormImpl purchase={m.d} co={co} userName={userName} setModal={setModal} getProject={getProject} allProjects={allProjects} purchases={purchases} providers={providers} addAudit={addAudit} saveOrAlert={saveOrAlert} /></Modal>;
      case "detail": return <Modal title={`Solicitud: ${m.d.provider} — ${m.d.projectCode}`} onClose={() => setModal(null)} wide><DetailView purchase={m.d} /></Modal>;
      case "pay": return <Modal title={`Registrar pago — ${m.d.provider}`} onClose={() => setModal(null)} wide><PaymentFormImpl purchase={m.d} setModal={setModal} addAudit={addAudit} updatePurchase={updatePurchase} /></Modal>;
      case "new-project": return <Modal title="Nuevo proyecto" onClose={() => setModal(null)}><ProjectFormImpl allProjects={allProjects} upsertProjectMeta={upsertProjectMeta} renameProjectAlias={renameProjectAlias} setModal={setModal} onSaved={(short) => { if (m.returnTo) setModal(m.returnTo); }} /></Modal>;
      case "edit-project": return <Modal title={`Editar proyecto — ${m.d.short}`} onClose={() => setModal(null)}><ProjectFormImpl allProjects={allProjects} upsertProjectMeta={upsertProjectMeta} renameProjectAlias={renameProjectAlias} setModal={setModal} project={m.d} /></Modal>;
      case "provider-new":  return <Modal title="Nuevo proveedor" onClose={() => setModal(null)} wide><ProviderFormImpl setModal={setModal} upsertProvider={upsertProvider} /></Modal>;
      case "provider-edit": return <Modal title={`Editar proveedor — ${m.d.name}`} onClose={() => setModal(null)} wide><ProviderFormImpl provider={m.d} setModal={setModal} upsertProvider={upsertProvider} deleteProvider={deleteProvider} /></Modal>;
      case "send-pickup":   return <Modal title={`🚛 Enviar a Logistica — ${m.d.provider}`} onClose={() => setModal(null)}><SendPickupFormImpl purchase={m.d} provider={findProviderByName(m.d.provider)} setModal={setModal} enviarAOrdenRecogida={enviarAOrdenRecogida} /></Modal>;
      default: return null;
    }
  };

  // ── LAYOUT ──
  return <div style={{ display: "flex", height: "100vh", fontFamily: "inherit", background: BEIGE, color: CHARCOAL }}>
    {/* Sidebar */}
    <div style={{ width: sb ? 240 : 60, background: DARK_BG, color: "#F0EBE3", transition: "width .2s", overflow: "hidden", display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ padding: sb ? "20px 16px" : "20px 12px", borderBottom: `1px solid ${DARK_BORDER}`, display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => setSb(!sb)} style={{ background: "none", border: "none", color: "#A8A096", fontSize: 20, cursor: "pointer", flexShrink: 0 }}>☰</button>
        {sb && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Logo size={28} showText={false} />
            <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: 1.5, color: "#F0EBE3", marginTop: 4 }}>GEOTECNICA</div>
            <div style={{ fontSize: 9, letterSpacing: 2, color: "#A8A096", fontWeight: 600 }}>SOLUCIONES · COMPRAS</div>
          </div>
        )}
      </div>
      <div style={{ padding: "8px 0", flex: 1, marginTop: 8 }}>
        {(() => {
          // Nav segun rol:
          // - Ana (asistente_compras): SOLO "Por coordinar" y "Proveedores"
          // - Todos los demas: ven todo (solicitudes, proyectos, por coordinar, proveedores)
          const allNav = [
            { id: "resumen", icon: "📊", label: "Resumen" },
            { id: "list", icon: "📋", label: "Solicitudes" },
            { id: "projects", icon: "🏗️", label: "Proyectos" },
            { id: "ana", icon: "📦", label: "Por coordinar" },
            { id: "providers", icon: "🏢", label: "Proveedores" },
          ];
          // Resumen (command center) solo para admin/gerencia/costos — quien
          // necesita dar seguimiento end-to-end. Ana ve su Kanban.
          const canSeeResumen = isAdmin || isGerencia || isCostos;
          const visibleNav = isAsistenteCompras
            ? allNav.filter(n => n.id === "ana" || n.id === "providers")
            : allNav.filter(n => n.id !== "resumen" || canSeeResumen);
          return visibleNav.map(n => <button key={n.id} onClick={() => setSec(n.id)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: sb ? "11px 20px" : "11px 18px", background: sec === n.id ? "rgba(232,118,45,0.18)" : "transparent", border: "none", color: sec === n.id ? "#fff" : "#A8A096", cursor: "pointer", fontSize: 14, textAlign: "left", borderLeft: sec === n.id ? `3px solid ${ORANGE}` : "3px solid transparent", fontFamily: "inherit", fontWeight: sec === n.id ? 600 : 500, transition: "all .15s" }}>
            <span style={{ fontSize: 18 }}>{n.icon}</span>{sb && <span>{n.label}</span>}
          </button>);
        })()}
      </div>
      {sb && <div style={{ padding: "12px", borderTop: `1px solid ${DARK_BORDER}`, display: "flex", flexDirection: "column", gap: 6 }}>
        {onBack && <button onClick={onBack} style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${DARK_BORDER}`, borderRadius: 8, color: "#A8A096", padding: "9px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, textAlign: "left", fontFamily: "inherit" }}>← Volver al panel</button>}
        {onLogout && <button onClick={onLogout} style={{ background: "rgba(192,57,43,0.15)", border: "1px solid rgba(192,57,43,0.4)", borderRadius: 8, color: "#F0AAA0", padding: "9px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, textAlign: "left", fontFamily: "inherit" }}>Cerrar sesion</button>}
        <div style={{ fontSize: 11, color: "#7A7268", marginTop: 4, fontWeight: 500, lineHeight: 1.4 }}>
          {userName || "Usuario"}<br />
          <span style={{ color: isTesoreria ? "#D4A017" : isGerencia ? "#A8B5C4" : ORANGE, fontWeight: 600 }}>
            {isAdmin ? "Operaciones" : isTesoreria ? "Tesoreria" : isGerencia ? "Gerencia (solo lectura)" : isCostos ? "Costos / Operaciones" : userRole}
          </span>
        </div>
      </div>}
    </div>

    {/* Main */}
    <div style={{ flex: 1, overflow: "auto" }}>
      <div style={{ padding: "22px 32px", borderBottom: `1px solid ${BORDER}`, background: CREAM, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: CHARCOAL, letterSpacing: -0.3 }}>
            {sec === "resumen" ? "Command Center — Seguimiento por proyecto"
              : sec === "projects" ? "Proyectos"
              : sec === "providers" ? "Proveedores"
              : sec === "ana" ? "Por coordinar con proveedores"
              : "Solicitudes de compra validadas"}
          </h2>
          <span style={{ fontSize: 13, color: cc.accent, fontWeight: 600, letterSpacing: 0.3 }}>{cc.name}</span>
        </div>
        <Badge color={cc.color}>{cp.length} solicitudes</Badge>
      </div>
      <div style={{ padding: 28 }}>{
        sec === "resumen" ? renderResumen()
          : sec === "projects" ? renderProjects()
          : sec === "providers" ? renderProviders()
          : sec === "ana" ? renderAnaKanban()
          : renderList()
      }</div>
    </div>
    {!canViewOnly && renderModal()}
  </div>;
}

const TH = { padding: "10px 14px", textAlign: "left", color: "#475569", fontWeight: 700, borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 };
const TD = { padding: "10px 14px", color: "#334155", whiteSpace: "nowrap", fontSize: 13 };
