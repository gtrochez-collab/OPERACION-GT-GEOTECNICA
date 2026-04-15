import { useState, useEffect, useRef } from "react";
import { store } from "./supabase.js";

// ── Constantes ──
const COMPANIES = {
  subterra: { name: "Subterra Honduras", color: "#0F4C75", accent: "#3282B8" },
  geotecnica: { name: "Geotecnica Soluciones", color: "#1B4332", accent: "#2D6A4F" },
};
const PROJECTS = [
  { code: "HF-12-4-17-2025", name: "Cimentacion Apolo", short: "APOLO" },
  { code: "HR-20-1-18-2025", name: "Muros Contencion Miramesi", short: "MIRAMESI" },
  { code: "HF-15-1-4-2026", name: "Micropilotes Villa Roy", short: "VILLA ROY" },
  { code: "HF-12-1-3-2026", name: "Cimentacion Ebenezer SPS", short: "EBENEZER" },
  { code: "HR-22-1-7-2026", name: "Colindancia Real de Minas", short: "REAL DE MINAS" },
  { code: "UE-102-5101", name: "PLANT-Instalaciones Plantel", short: "PLAN-TALLER" },
  { code: "OFICINA", name: "Oficina Administrativa", short: "OFICINA" },
];
const UNITS = ["Unidad", "Bolsa", "Caja", "Rollo", "Galon", "Litro", "Kg", "Quintal", "Metro", "m2", "m3", "Par", "Set", "Servicio", "Global", "Viaje", "Hora"];
const PAYMENT_METHODS = ["Transferencia BAC", "Transferencia Banco Atlantida", "Transferencia Ficohsa", "Cheque", "Efectivo", "Tarjeta corporativa", "Otro"];

// Estados del proceso (simplificado y claro)
const STATUSES = {
  borrador:   { label: "Borrador",               color: "#64748b", bg: "#F1F5F9", order: 1, desc: "Operaciones aun no valida" },
  validado:   { label: "Validado — Pendiente de pago", color: "#D97706", bg: "#FEF3C7", order: 2, desc: "Operaciones valido, tesoreria debe pagar" },
  pagado:     { label: "Pagado (sin comprobante)", color: "#2563EB", bg: "#DBEAFE", order: 3, desc: "Pago realizado, falta cargar comprobante" },
  finalizado: { label: "Finalizado",             color: "#059669", bg: "#DCFCE7", order: 4, desc: "Pago con comprobante cargado" },
};

// ── Utils ──
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
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
  const b = { border: "none", borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer", fontWeight: 600, fontSize: small ? 12 : 14, padding: small ? "5px 12px" : "9px 20px", opacity: disabled ? 0.5 : 1 };
  const v = {
    primary: { ...b, background: "#BE185D", color: "#fff" },
    success: { ...b, background: "#2D6A4F", color: "#fff" },
    info: { ...b, background: "#2563EB", color: "#fff" },
    warn: { ...b, background: "#D97706", color: "#fff" },
    danger: { ...b, background: "#C0392B", color: "#fff" },
    ghost: { ...b, background: "transparent", color: "#475569", border: "1px solid #CBD5E1" },
  };
  return <button type={type || "button"} style={{ ...(v[variant] || v.primary), ...sx }} onClick={onClick} disabled={disabled}>{children}</button>;
};

const Input = ({ label, ...p }) => <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{label && <label style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>{label}</label>}<input style={{ padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 14, outline: "none", background: "#F8FAFC" }} {...p} /></div>;

const Textarea = ({ label, ...p }) => <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{label && <label style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>{label}</label>}<textarea style={{ padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 14, outline: "none", background: "#F8FAFC", fontFamily: "inherit", resize: "vertical", minHeight: 70 }} {...p} /></div>;

const Select = ({ label, options, ...p }) => <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{label && <label style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>{label}</label>}<select style={{ padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 14, background: "#F8FAFC" }} {...p}><option value="">—</option>{options.map(o => <option key={typeof o === "string" ? o : o.value} value={typeof o === "string" ? o : o.value}>{typeof o === "string" ? o : o.label}</option>)}</select></div>;

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
    if (f.size > 5 * 1024 * 1024) {
      if (!confirm(`El archivo pesa ${fmtMB(f.size)}. Recomendado menor a 5 MB. ¿Continuar?`)) {
        e.target.value = ""; return;
      }
    }
    setBusy(true);
    try {
      const fd = await readFileAsDataUrl(f);
      onUpload(fd);
    } catch (err) {
      alert("Error al leer el archivo: " + err);
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

// Status badge
const StatusBadge = ({ status }) => {
  const s = STATUSES[status] || STATUSES.borrador;
  return <span style={{ background: s.bg, color: s.color, padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{s.label}</span>;
};

// ── MODULO ──
export default function PurchasesModule({ userRole, userName, onBack, onLogout }) {
  const isAdmin = userRole === "admin";
  const isTesoreria = userRole === "tesoreria";
  const isGerencia = userRole === "gerencia";

  // Permisos:
  // admin → Operaciones (crea, valida) + Tesoreria (paga, sube comprobante). FULL.
  // tesoreria → registra pago, cambia estado pagado/finalizado, sube comprobante.
  // gerencia → solo lectura.
  const canCreate = isAdmin;                       // crear/editar/validar solicitudes
  const canPay = isAdmin || isTesoreria;           // registrar pago y subir comprobante
  const canViewOnly = isGerencia;

  const [co, setCo] = useState("subterra");
  const [purchases, setPurchases] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [modal, setModal] = useState(null);
  const [sb, setSb] = useState(true);
  const [sec, setSec] = useState("list");
  const [filter, setFilter] = useState({ status: "", project: "", provider: "", from: "", to: "" });

  useEffect(() => {
    (async () => {
      const p = await store.get("cp-purchases");
      if (p) setPurchases(p);
      setLoaded(true);
    })();
  }, []);

  const sP = d => { setPurchases(d); store.set("cp-purchases", d); };
  const cp = purchases.filter(p => p.company === co);

  const addAudit = (p, action, note) => ({
    ...p,
    audit: [...(p.audit || []), { action, by: userName || userRole, role: userRole, at: new Date().toISOString(), note: note || "" }],
  });

  const updatePurchase = (updated) => sP(purchases.map(p => p.id === updated.id ? updated : p));
  const removePurchase = (id) => sP(purchases.filter(p => p.id !== id));

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
  };

  if (!loaded) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'Segoe UI', sans-serif", color: "#64748b" }}>Cargando Compras-Operaciones...</div>;

  // ── FORMULARIO: Nueva / Editar solicitud (Operaciones) ──
  const PurchaseForm = ({ purchase }) => {
    const [f, setF] = useState(purchase || {
      company: co, projectCode: "", provider: "", description: "", quantity: 1, unit: "Unidad",
      amount: "", quoteNumber: "", opsNotes: "", opsResponsible: userName || "",
      bacAccount: "", quoteFile: null, receiptFile: null,
      status: "borrador", createdAt: new Date().toISOString(), audit: [],
      paymentMethod: "Transferencia BAC", paymentReference: "", paymentDate: "", treasuryNotes: "",
    });
    const u = (k, v) => setF(p => ({ ...p, [k]: v }));

    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Select label="Empresa" options={[{ value: "subterra", label: "Subterra Honduras" }, { value: "geotecnica", label: "Geotecnica Soluciones" }]} value={f.company} onChange={e => u("company", e.target.value)} />
        <Select label="Proyecto" options={PROJECTS.map(p => ({ value: p.short, label: `${p.short} — ${p.name}` }))} value={f.projectCode} onChange={e => u("projectCode", e.target.value)} />
        <Input label="Proveedor" value={f.provider} onChange={e => u("provider", e.target.value)} placeholder="Nombre del proveedor" />
        <Input label="N° de Cotizacion" value={f.quoteNumber} onChange={e => u("quoteNumber", e.target.value)} placeholder="Ej: COT-2026-0123" />
        <div style={{ gridColumn: "1/-1" }}>
          <Textarea label="Descripcion de la compra" value={f.description} onChange={e => u("description", e.target.value)} placeholder="Detalle del bien o servicio a adquirir" />
        </div>
        <Input label="Cantidad" type="number" step="0.01" value={f.quantity} onChange={e => u("quantity", e.target.value)} />
        <Select label="Unidad" options={UNITS} value={f.unit} onChange={e => u("unit", e.target.value)} />
        <Input label="Monto total (Lempiras)" type="number" step="0.01" value={f.amount} onChange={e => u("amount", e.target.value)} placeholder="0.00" />
        <Input label="Responsable de Operaciones" value={f.opsResponsible} onChange={e => u("opsResponsible", e.target.value)} placeholder="Quien valida por Operaciones" />
        <Input label="Cuenta BAC del proveedor (opcional)" value={f.bacAccount} onChange={e => u("bacAccount", e.target.value)} placeholder="Ej: 10-251-000123" />
        <div style={{ gridColumn: "1/-1" }}>
          <Textarea label="Notas de Operaciones para Tesoreria" value={f.opsNotes} onChange={e => u("opsNotes", e.target.value)} placeholder="Urgencia, condiciones de pago, referencias al proyecto, etc." />
        </div>
      </div>

      <FileSlot
        label="Cotizacion aprobada del proveedor"
        file={f.quoteFile}
        canUpload
        accent="#2563EB"
        onUpload={fd => u("quoteFile", fd)}
        onRemove={() => u("quoteFile", null)}
      />

      <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: 12, fontSize: 12, color: "#64748b" }}>
        💡 Al <b>Validar</b> la solicitud pasa a Tesoreria con estado <b>Pendiente de pago</b>. Antes de validar podes guardar como <b>Borrador</b> y completar luego.
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 12, color: "#64748b" }}>
          {purchase ? `Creada: ${fmtDT(purchase.createdAt)}` : "Nueva solicitud"}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
          <Btn variant="warn" onClick={() => {
            if (!f.projectCode || !f.provider || !f.description || !f.amount) return alert("Complete proyecto, proveedor, descripcion y monto");
            const rec = { ...f, id: f.id || uid(), status: "borrador" };
            const saved = purchase ? addAudit(rec, "edited", "Guardado como borrador") : addAudit(rec, "created", "Creado como borrador");
            if (purchase) updatePurchase(saved); else sP([...purchases, saved]);
            setModal(null);
          }}>💾 Guardar borrador</Btn>
          <Btn variant="success" onClick={() => {
            if (!f.projectCode || !f.provider || !f.description || !f.amount || !f.quoteNumber || !f.opsResponsible) return alert("Para validar: complete proyecto, proveedor, descripcion, monto, N° cotizacion y responsable");
            if (!f.quoteFile) { if (!confirm("No hay cotizacion adjunta. ¿Validar de todas formas?")) return; }
            const rec = { ...f, id: f.id || uid(), status: "validado", validatedAt: new Date().toISOString() };
            const saved = addAudit(rec, "validated", `Validado por Operaciones (${f.opsResponsible})`);
            if (purchase) updatePurchase(saved); else sP([...purchases, saved]);
            setModal(null);
            alert("✓ Solicitud validada. Tesoreria la vera en el listado de pendientes de pago.");
          }}>✓ Validar y enviar a Tesoreria</Btn>
        </div>
      </div>
    </div>;
  };

  // ── FORMULARIO: Registrar pago (Tesoreria) ──
  const PaymentForm = ({ purchase }) => {
    const [f, setF] = useState({
      paymentMethod: purchase.paymentMethod || "Transferencia BAC",
      paymentReference: purchase.paymentReference || "",
      paymentDate: purchase.paymentDate || new Date().toISOString().slice(0, 10),
      treasuryNotes: purchase.treasuryNotes || "",
      bacAccount: purchase.bacAccount || "",
    });
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
          <div><b>Validado por:</b> {purchase.opsResponsible || "—"}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Select label="Metodo de pago" options={PAYMENT_METHODS} value={f.paymentMethod} onChange={e => u("paymentMethod", e.target.value)} />
        <Input label="N° de referencia / transferencia / cheque" value={f.paymentReference} onChange={e => u("paymentReference", e.target.value)} placeholder="Ej: TRF-29384756" />
        <Input label="Fecha del pago" type="date" value={f.paymentDate} onChange={e => u("paymentDate", e.target.value)} />
        <Input label="Cuenta BAC destino" value={f.bacAccount} onChange={e => u("bacAccount", e.target.value)} placeholder="Cuenta del proveedor" />
        <div style={{ gridColumn: "1/-1" }}>
          <Textarea label="Notas de Tesoreria" value={f.treasuryNotes} onChange={e => u("treasuryNotes", e.target.value)} placeholder="Observaciones, descuentos aplicados, retenciones, etc." />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
        <Btn variant="success" onClick={() => {
          if (!f.paymentReference || !f.paymentDate) return alert("Ingrese referencia y fecha de pago");
          const rec = {
            ...purchase, ...f,
            status: "pagado",
            paidAt: new Date(f.paymentDate).toISOString(),
          };
          const saved = addAudit(rec, "paid", `Pago ${f.paymentMethod} — ref. ${f.paymentReference}`);
          updatePurchase(saved);
          setModal({ t: "detail", d: saved });
          setTimeout(() => alert("✓ Pago registrado. Ahora sube el comprobante de transferencia."), 100);
        }}>💰 Registrar pago</Btn>
      </div>
    </div>;
  };

  // ── VISTA DETALLE ──
  const DetailView = ({ purchase }) => {
    const [p, setP] = useState(purchase);
    const s = STATUSES[p.status] || STATUSES.borrador;

    const setQuoteFile = (fd) => {
      const rec = { ...p, quoteFile: fd };
      const saved = addAudit(rec, "quote_uploaded", `Cotizacion cargada: ${fd.name}`);
      setP(saved); updatePurchase(saved);
    };
    const removeQuoteFile = () => {
      const rec = { ...p, quoteFile: null };
      const saved = addAudit(rec, "quote_removed", "Cotizacion eliminada");
      setP(saved); updatePurchase(saved);
    };

    const setReceiptFile = (fd) => {
      const rec = { ...p, receiptFile: fd, status: "finalizado", finalizedAt: new Date().toISOString() };
      const saved = addAudit(rec, "receipt_uploaded", `Comprobante cargado — solicitud FINALIZADA`);
      setP(saved); updatePurchase(saved);
    };
    const removeReceiptFile = () => {
      if (!confirm("¿Eliminar comprobante? La solicitud volvera a estado 'Pagado sin comprobante'.")) return;
      const rec = { ...p, receiptFile: null, status: "pagado", finalizedAt: null };
      const saved = addAudit(rec, "receipt_removed", "Comprobante eliminado");
      setP(saved); updatePurchase(saved);
    };

    const revertToValidado = () => {
      if (!confirm("¿Revertir pago? Borrara datos del pago y volvera a estado 'Pendiente de pago'.")) return;
      const rec = { ...p, status: "validado", paidAt: null, paymentMethod: "", paymentReference: "", paymentDate: "", receiptFile: null };
      const saved = addAudit(rec, "payment_reverted", "Pago revertido por Tesoreria");
      setP(saved); updatePurchase(saved);
    };

    const canEditOps = canCreate && (p.status === "borrador" || p.status === "validado");
    const canRegisterPay = canPay && p.status === "validado";
    const canUploadReceipt = canPay && (p.status === "pagado" || p.status === "finalizado");
    const canRevertPay = canPay && (p.status === "pagado" || p.status === "finalizado");

    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header de estado */}
      <div style={{ background: s.bg, border: `2px solid ${s.color}`, borderRadius: 12, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Estado actual</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.label}</div>
          <div style={{ fontSize: 12, color: s.color, opacity: 0.85 }}>{s.desc}</div>
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
          <div><div style={{ fontSize: 11, color: "#64748b" }}>Cuenta BAC</div><div style={{ fontWeight: 600 }}>{p.bacAccount || "—"}</div></div>
          <div><div style={{ fontSize: 11, color: "#64748b" }}>Cantidad</div><div style={{ fontWeight: 600 }}>{p.quantity} {p.unit}</div></div>
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
      </div>

      {/* Pago (si aplica) */}
      {(p.status === "pagado" || p.status === "finalizado") && <div style={{ background: "#ECFDF5", border: "1px solid #6EE7B7", borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#065F46", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>💰 Datos del pago (Tesoreria)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, fontSize: 13 }}>
          <div><div style={{ fontSize: 11, color: "#047857" }}>Metodo</div><div style={{ fontWeight: 600 }}>{p.paymentMethod}</div></div>
          <div><div style={{ fontSize: 11, color: "#047857" }}>Referencia</div><div style={{ fontWeight: 600 }}>{p.paymentReference}</div></div>
          <div><div style={{ fontSize: 11, color: "#047857" }}>Fecha de pago</div><div style={{ fontWeight: 600 }}>{fmt(p.paymentDate)}</div></div>
          {p.treasuryNotes && <div style={{ gridColumn: "1/-1" }}>
            <div style={{ fontSize: 11, color: "#047857" }}>Notas de Tesoreria</div>
            <div style={{ fontStyle: "italic", color: "#064E3B", background: "#fff", padding: 10, borderRadius: 8, border: "1px solid #A7F3D0" }}>{p.treasuryNotes}</div>
          </div>}
        </div>
      </div>}

      {/* Archivos */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <FileSlot
          label="📄 Cotizacion del proveedor"
          file={p.quoteFile}
          canUpload={canEditOps}
          accent="#2563EB"
          onUpload={setQuoteFile}
          onRemove={removeQuoteFile}
        />
        <FileSlot
          label="🧾 Comprobante de transferencia"
          file={p.receiptFile}
          canUpload={canUploadReceipt}
          accent="#059669"
          onUpload={setReceiptFile}
          onRemove={removeReceiptFile}
        />
      </div>

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

      {/* Acciones */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, paddingTop: 10, borderTop: "1px solid #E2E8F0" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canEditOps && <Btn variant="ghost" onClick={() => setModal({ t: "edit", d: p })}>✏️ Editar (Ops)</Btn>}
          {canRegisterPay && <Btn variant="success" onClick={() => setModal({ t: "pay", d: p })}>💰 Registrar pago</Btn>}
          {canRevertPay && <Btn variant="warn" onClick={revertToValidado}>↺ Revertir pago</Btn>}
          {canCreate && <Btn variant="danger" onClick={() => { if (confirm(`¿Eliminar la solicitud de ${p.provider}?`)) { removePurchase(p.id); setModal(null); } }}>🗑 Eliminar</Btn>}
        </div>
        <Btn variant="ghost" onClick={() => setModal(null)}>Cerrar</Btn>
      </div>
    </div>;
  };

  // ── SECCIONES ──
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
      </div>

      {/* Carolina destacado si es tesoreria */}
      {isTesoreria && stats.validado > 0 && <div style={{ background: "linear-gradient(135deg, #FEF3C7, #FDE68A)", border: "1px solid #F59E0B", borderRadius: 12, padding: 14, color: "#92400E", fontSize: 14, fontWeight: 600 }}>
        👋 Hola Lic. Carolina, tenes <b style={{ fontSize: 18, color: "#D97706" }}>{stats.validado} solicitud{stats.validado === 1 ? "" : "es"}</b> pendiente{stats.validado === 1 ? "" : "s"} de pago — <b>{fmtL(stats.montoPendiente)}</b>
      </div>}

      {/* Filtros + acciones */}
      <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: 14, display: "grid", gridTemplateColumns: "1.2fr 1.2fr 1.5fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
        <Select label="Estado" options={Object.entries(STATUSES).map(([k, v]) => ({ value: k, label: v.label }))} value={filter.status} onChange={e => setFilter(s => ({ ...s, status: e.target.value }))} />
        <Select label="Proyecto" options={PROJECTS.map(p => ({ value: p.short, label: p.short }))} value={filter.project} onChange={e => setFilter(s => ({ ...s, project: e.target.value }))} />
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
              <td style={TD}><StatusBadge status={p.status} /></td>
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
      case "new": return <Modal title="Nueva solicitud de compra" onClose={() => setModal(null)} wide><PurchaseForm /></Modal>;
      case "edit": return <Modal title={`Editar solicitud — ${m.d.provider}`} onClose={() => setModal(null)} wide><PurchaseForm purchase={m.d} /></Modal>;
      case "detail": return <Modal title={`Solicitud: ${m.d.provider} — ${m.d.projectCode}`} onClose={() => setModal(null)} wide><DetailView purchase={m.d} /></Modal>;
      case "pay": return <Modal title={`Registrar pago — ${m.d.provider}`} onClose={() => setModal(null)} wide><PaymentForm purchase={m.d} /></Modal>;
      default: return null;
    }
  };

  // ── LAYOUT ──
  return <div style={{ display: "flex", height: "100vh", fontFamily: "'Segoe UI', -apple-system, sans-serif", background: "#F1F5F9", color: "#1E293B" }}>
    {/* Sidebar */}
    <div style={{ width: sb ? 240 : 60, background: "#0F172A", color: "#fff", transition: "width .2s", overflow: "hidden", display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ padding: "20px 16px", borderBottom: "1px solid #1E293B", display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => setSb(!sb)} style={{ background: "none", border: "none", color: "#94A3B8", fontSize: 20, cursor: "pointer", flexShrink: 0 }}>☰</button>
        {sb && <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}>Compras-Operaciones</div>}
      </div>
      {sb && <div style={{ padding: "14px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Empresa</div>
        {Object.entries(COMPANIES).map(([k, v]) => <button key={k} onClick={() => setCo(k)} style={{ background: co === k ? v.accent : "transparent", color: co === k ? "#fff" : "#94A3B8", border: co === k ? "none" : "1px solid #334155", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600, textAlign: "left" }}>{v.name}</button>)}
      </div>}
      <div style={{ padding: "8px 0", flex: 1 }}>
        <button onClick={() => setSec("list")} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: sb ? "10px 20px" : "10px 18px", background: sec === "list" ? "#BE185D40" : "transparent", border: "none", color: sec === "list" ? "#fff" : "#94A3B8", cursor: "pointer", fontSize: 14, textAlign: "left", borderLeft: sec === "list" ? "3px solid #EC4899" : "3px solid transparent" }}>
          <span style={{ fontSize: 18 }}>📋</span>{sb && <span>Solicitudes</span>}
        </button>
      </div>
      {sb && <div style={{ padding: "12px", borderTop: "1px solid #1E293B", display: "flex", flexDirection: "column", gap: 6 }}>
        {onBack && <button onClick={onBack} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid #334155", borderRadius: 8, color: "#94A3B8", padding: "8px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, textAlign: "left" }}>← Volver al panel</button>}
        {onLogout && <button onClick={onLogout} style={{ background: "rgba(220,38,38,0.15)", border: "1px solid #7F1D1D", borderRadius: 8, color: "#FCA5A5", padding: "8px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, textAlign: "left" }}>Cerrar sesion</button>}
        <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>
          {userName || "Usuario"}<br />
          <span style={{ color: isTesoreria ? "#FBBF24" : isGerencia ? "#60A5FA" : "#34D399" }}>
            {isAdmin ? "Operaciones + Tesoreria" : isTesoreria ? "Tesoreria" : isGerencia ? "Gerencia (solo lectura)" : userRole}
          </span>
        </div>
      </div>}
    </div>

    {/* Main */}
    <div style={{ flex: 1, overflow: "auto" }}>
      <div style={{ padding: "20px 28px", borderBottom: "1px solid #E2E8F0", background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Solicitudes de compra validadas</h2>
          <span style={{ fontSize: 13, color: cc.accent, fontWeight: 600 }}>{cc.name}</span>
        </div>
        <Badge color={cc.color}>{cp.length} solicitudes</Badge>
      </div>
      <div style={{ padding: 28 }}>{renderList()}</div>
    </div>
    {renderModal()}
  </div>;
}

const TH = { padding: "10px 14px", textAlign: "left", color: "#475569", fontWeight: 700, borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 };
const TD = { padding: "10px 14px", color: "#334155", whiteSpace: "nowrap", fontSize: 13 };
