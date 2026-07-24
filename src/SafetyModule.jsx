// =====================================================================
// GEOSAFETY — EPP: catalogo, inventario, proveedores y requisiciones
// =====================================================================
// Modelo "Amazon interno": los encargados de area/proyecto agregan EPP
// al carrito y envian una requisicion indicando PARA QUE COLABORADOR es
// cada item (amarrado a hr-emps5 de GeoTeam) y el MOTIVO:
//   - primera_vez : dotacion inicial (sin cargo)
//   - perdida     : perdida/extravio → ALERTA: se deduce en planilla
//   - danio       : dano/desgaste normal (sin cargo)
//
// Storage keys (Supabase via store):
//   - ep-providers : proveedores de EPP (Chispa Safety, Larach, etc.)
//   - ep-items     : catalogo de items {nombre, categoria, proveedorId, precio, stock}
//   - ep-reqs      : requisiciones {numero, solicitante, lineas[], estado}
//   Lee (NO escribe): hr-emps5 — empleados de GeoTeam.
//
// Flujo requisicion: pendiente → aprobada → entregada (descuenta stock).
// Las lineas con motivo "perdida" alimentan la pestana "Descuentos planilla"
// para que tesoreria las deduzca y marque como deducidas.
// =====================================================================

import { useState, useEffect, useMemo } from "react";
import { store } from "./supabase.js";
import { BRAND, FONT, R } from "./theme.js";

// ── Constantes de dominio ──
const CATEGORIAS = [
  { value: "construccion", label: "EPP Construcción", icon: "🏗️" },
  { value: "concreto",     label: "EPP Concreto",     icon: "🧱" },
  { value: "soldadura",    label: "EPP Soldadura",    icon: "🔥" },
  { value: "mecanica",     label: "EPP Mecánica",     icon: "🔧" },
  { value: "torno",        label: "EPP Torno",        icon: "⚙️" },
];
const catLabel = (v) => CATEGORIAS.find((c) => c.value === v)?.label || v || "—";
const catIcon = (v) => CATEGORIAS.find((c) => c.value === v)?.icon || "🦺";

const MOTIVOS = [
  { value: "primera_vez", label: "Primera vez (dotación)", chip: "PRIMERA VEZ", color: BRAND.blue,   bg: BRAND.blueSoft },
  { value: "perdida",     label: "Pérdida / extravío ⚠",   chip: "PÉRDIDA",     color: BRAND.red,    bg: BRAND.redSoft },
  { value: "danio",       label: "Daño / desgaste",        chip: "DAÑO",        color: BRAND.yellow, bg: BRAND.yellowSoft },
];
const motivoDef = (v) => MOTIVOS.find((m) => m.value === v) || MOTIVOS[0];

const PROV_SEED = ["Chispa Safety", "Larach y Compañía", "La Mundial", "Summit", "Infra", "Amazon"];

const ESTADOS = {
  pendiente: { label: "PENDIENTE",  color: BRAND.yellow, bg: BRAND.yellowSoft },
  aprobada:  { label: "APROBADA",   color: BRAND.blue,   bg: BRAND.blueSoft },
  entregada: { label: "ENTREGADA",  color: BRAND.green,  bg: BRAND.greenSoft },
  rechazada: { label: "RECHAZADA",  color: BRAND.red,    bg: BRAND.redSoft },
};

const GREEN = "#059669";
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const fmtL = (n) => "L " + Number(n || 0).toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("es-HN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const coTag = (c) => (c === "subterra" ? "SUB" : "GEO");

// ── UI primitives ──
const BTN_V = {
  primary: { background: BRAND.orange, color: "#fff", border: `1px solid ${BRAND.orange}` },
  success: { background: GREEN, color: "#fff", border: `1px solid ${GREEN}` },
  danger:  { background: BRAND.red, color: "#fff", border: `1px solid ${BRAND.red}` },
  info:    { background: BRAND.blue, color: "#fff", border: `1px solid ${BRAND.blue}` },
  ghost:   { background: "#fff", color: BRAND.ink, border: `1px solid ${BRAND.border}` },
};
const Btn = ({ children, onClick, variant = "primary", small, disabled, style }) => (
  <button onClick={onClick} disabled={disabled} style={{ ...BTN_V[variant], padding: small ? "5px 10px" : "9px 16px", borderRadius: R.sm, fontSize: small ? 12 : 13, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, fontFamily: FONT.body, ...style }}>{children}</button>
);
const Field = ({ label, children }) => (
  <label style={{ display: "block" }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.graphite, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>{label}</div>
    {children}
  </label>
);
const inputSt = { width: "100%", padding: "9px 11px", borderRadius: R.sm, border: `1px solid ${BRAND.border}`, fontSize: 13, fontFamily: FONT.body, background: "#fff", color: BRAND.charcoal, boxSizing: "border-box" };
const Input = ({ label, ...p }) => <Field label={label}><input {...p} style={{ ...inputSt, ...p.style }} /></Field>;
const Select = ({ label, options, placeholder, ...p }) => (
  <Field label={label}>
    <select {...p} style={{ ...inputSt, ...p.style }}>
      {placeholder != null && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </Field>
);
const Chip = ({ color, bg, children, style }) => (
  <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: R.full, fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, color, background: bg, whiteSpace: "nowrap", ...style }}>{children}</span>
);
const Modal = ({ title, onClose, children, width = 640 }) => (
  <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(44,42,40,0.45)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}>
    <div onClick={(e) => e.stopPropagation()} style={{ background: BRAND.cream, borderRadius: R.lg, width: "100%", maxWidth: width, boxShadow: BRAND.shadowLg, border: `1px solid ${BRAND.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 22px", borderBottom: `1px solid ${BRAND.border}` }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: BRAND.charcoal, fontFamily: FONT.display }}>{title}</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: BRAND.stone }}>×</button>
      </div>
      <div style={{ padding: 22 }}>{children}</div>
    </div>
  </div>
);
const th = { padding: "9px 10px", textAlign: "left", fontSize: 10.5, fontWeight: 800, color: BRAND.graphite, textTransform: "uppercase", letterSpacing: 0.5, borderBottom: `2px solid ${BRAND.border}`, whiteSpace: "nowrap" };
const td = { padding: "9px 10px", fontSize: 13, color: BRAND.charcoal, borderBottom: `1px solid ${BRAND.borderSoft}`, verticalAlign: "middle" };

// =====================================================================
export default function SafetyModule({ userRole, userName, onBack, onLogout }) {
  const [providers, setProviders] = useState([]);
  const [items, setItems] = useState([]);
  const [reqs, setReqs] = useState([]);
  const [emps, setEmps] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [sec, setSec] = useState("catalogo");
  const [modal, setModal] = useState(null); // {t: "cart"|"item"|"prov"|"reqdetail", ...}
  const [cart, setCart] = useState([]);     // [{itemId, qty, paraEmpId, motivo}]
  const [fCat, setFCat] = useState("");     // filtro categoria catalogo
  const [fProv, setFProv] = useState("");   // filtro proveedor catalogo
  const [fQ, setFQ] = useState("");         // busqueda catalogo
  const [fReqEstado, setFReqEstado] = useState("");

  const canManage = ["admin", "costos", "almacenista"].includes(userRole);
  const canDeduct = canManage || userRole === "tesoreria";
  const readOnly = userRole === "gerencia";

  useEffect(() => {
    (async () => {
      const [pv, it, rq, em] = await Promise.all([
        store.get("ep-providers"), store.get("ep-items"), store.get("ep-reqs"), store.get("hr-emps5"),
      ]);
      setProviders(Array.isArray(pv) ? pv : []);
      setItems(Array.isArray(it) ? it : []);
      setReqs(Array.isArray(rq) ? rq : []);
      setEmps(Array.isArray(em) ? em : []);
      setLoaded(true);
    })();
  }, []);

  // Guardado robusto: si falla la nube, avisar y devolver false (mantener modal abierto).
  const sProv = async (v) => { setProviders(v); const ok = await store.set("ep-providers", v); if (!ok) alert("⚠ No se guardó en la nube (ep-providers). Revisá tu conexión e intentá de nuevo."); return ok; };
  const sItems = async (v) => { setItems(v); const ok = await store.set("ep-items", v); if (!ok) alert("⚠ No se guardó en la nube (ep-items). Revisá tu conexión e intentá de nuevo."); return ok; };
  const sReqs = async (v) => { setReqs(v); const ok = await store.set("ep-reqs", v); if (!ok) alert("⚠ No se guardó en la nube (ep-reqs). Revisá tu conexión e intentá de nuevo."); return ok; };

  const provName = (id) => providers.find((p) => p.id === id)?.nombre || "—";
  const activeEmps = useMemo(() => emps.filter((e) => e.status === "active").sort((a, b) => String(a.fullName).localeCompare(b.fullName)), [emps]);
  const empById = (id) => emps.find((e) => e.id === id);

  // Lineas de perdida (descuentos planilla) sobre reqs no rechazadas
  const perdidas = useMemo(() => {
    const out = [];
    for (const r of reqs) {
      if (r.estado === "rechazada") continue;
      (r.lineas || []).forEach((l, idx) => { if (l.motivo === "perdida") out.push({ req: r, linea: l, idx }); });
    }
    return out.sort((a, b) => String(b.req.fecha).localeCompare(String(a.req.fecha)));
  }, [reqs]);
  const perdidasPend = perdidas.filter((p) => !p.linea.deducido);
  const reqsPendientes = reqs.filter((r) => r.estado === "pendiente").length;

  // ── Carrito ──
  const addToCart = (item) => {
    setCart((c) => {
      const ex = c.find((l) => l.itemId === item.id && !l.paraEmpId);
      if (ex) return c.map((l) => (l === ex ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { key: uid(), itemId: item.id, qty: 1, paraEmpId: "", motivo: "" }];
    });
  };
  const cartCount = cart.reduce((s, l) => s + (Number(l.qty) || 0), 0);

  const enviarRequisicion = async () => {
    if (!cart.length) return;
    for (const l of cart) {
      const it = items.find((i) => i.id === l.itemId);
      if (!Number(l.qty) || Number(l.qty) < 1) return alert(`Cantidad inválida en "${it?.nombre}".`);
      if (!l.paraEmpId) return alert(`Falta indicar PARA QUIÉN es "${it?.nombre}".`);
      if (!l.motivo) return alert(`Falta el MOTIVO de "${it?.nombre}".`);
    }
    const numero = "EPP-" + String(reqs.length + 1).padStart(3, "0");
    const lineas = cart.map((l) => {
      const it = items.find((i) => i.id === l.itemId) || {};
      const emp = empById(l.paraEmpId) || {};
      return { itemId: l.itemId, nombre: it.nombre, categoria: it.categoria, proveedor: provName(it.proveedorId), precio: Number(it.precio) || 0, qty: Number(l.qty), paraEmpId: l.paraEmpId, paraNombre: emp.fullName || "—", paraEmpresa: emp.company || "", motivo: l.motivo, deducido: false };
    });
    const tienePerdida = lineas.some((l) => l.motivo === "perdida");
    const req = { id: uid(), numero, solicitante: userName, fecha: new Date().toISOString(), estado: "pendiente", lineas, total: lineas.reduce((s, l) => s + l.precio * l.qty, 0) };
    const ok = await sReqs([req, ...reqs]);
    if (!ok) return; // modal queda abierto, carrito intacto
    setCart([]); setModal(null); setSec("requisiciones");
    alert(`✅ Requisición ${numero} enviada.` + (tienePerdida ? "\n\n⚠ Incluye PÉRDIDA/EXTRAVÍO: quedó registrada en \"Descuentos planilla\" para deducirla al colaborador." : ""));
  };

  // ── Acciones de requisicion ──
  const setEstadoReq = async (req, estado) => {
    const verbo = { aprobada: "APROBAR", rechazada: "RECHAZAR", entregada: "marcar ENTREGADA" }[estado];
    if (!confirm(`¿${verbo} la requisición ${req.numero}?` + (estado === "entregada" ? "\n\nSe descontará el stock del inventario." : ""))) return;
    const upd = reqs.map((r) => (r.id === req.id ? { ...r, estado, [estado + "Por"]: userName, [estado + "At"]: new Date().toISOString() } : r));
    const ok = await sReqs(upd);
    if (!ok) return;
    if (estado === "entregada") {
      const ni = items.map((it) => {
        const q = (req.lineas || []).filter((l) => l.itemId === it.id).reduce((s, l) => s + l.qty, 0);
        return q ? { ...it, stock: Math.max(0, (Number(it.stock) || 0) - q) } : it;
      });
      const ok2 = await sItems(ni);
      if (!ok2) alert("⚠ La requisición quedó ENTREGADA pero el stock NO se pudo actualizar. Ajustalo manualmente en Inventario.");
    }
  };

  const toggleDeducido = async (reqId, idx) => {
    const upd = reqs.map((r) => r.id !== reqId ? r : { ...r, lineas: r.lineas.map((l, i) => (i === idx ? { ...l, deducido: !l.deducido, deducidoPor: !l.deducido ? userName : undefined, deducidoAt: !l.deducido ? new Date().toISOString() : undefined } : l)) });
    await sReqs(upd);
  };

  // ══════════════════════════ RENDERS ══════════════════════════

  const renderCatalogo = () => {
    const vis = items.filter((it) =>
      (!fCat || it.categoria === fCat) && (!fProv || it.proveedorId === fProv) &&
      (!fQ || String(it.nombre).toLowerCase().includes(fQ.toLowerCase()))
    ).sort((a, b) => String(a.nombre).localeCompare(b.nombre));
    return (
      <div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16 }}>
          <div style={{ flex: "1 1 220px" }}><Input label="Buscar" placeholder="Casco, guantes, careta…" value={fQ} onChange={(e) => setFQ(e.target.value)} /></div>
          <div style={{ flex: "0 1 210px" }}><Select label="Categoría" placeholder="Todas" options={CATEGORIAS} value={fCat} onChange={(e) => setFCat(e.target.value)} /></div>
          <div style={{ flex: "0 1 210px" }}><Select label="Proveedor" placeholder="Todos" options={providers.map((p) => ({ value: p.id, label: p.nombre }))} value={fProv} onChange={(e) => setFProv(e.target.value)} /></div>
          {canManage && <Btn variant="ghost" onClick={() => setModal({ t: "item" })}>+ Nuevo ítem</Btn>}
        </div>
        {!items.length ? (
          <div style={{ textAlign: "center", padding: 60, color: BRAND.stone, background: "#fff", borderRadius: R.lg, border: `1px dashed ${BRAND.border}` }}>
            <div style={{ fontSize: 40 }}>🦺</div>
            <div style={{ fontWeight: 700, color: BRAND.ink, marginTop: 8 }}>El catálogo está vacío</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>{canManage ? "Cargá los proveedores en su pestaña y luego agregá ítems con su precio real." : "El administrador aún no carga ítems de EPP."}</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 14 }}>
            {vis.map((it) => {
              const sinStock = (Number(it.stock) || 0) <= 0;
              const bajo = !sinStock && (Number(it.stock) || 0) <= (Number(it.minStock) || 0);
              return (
                <div key={it.id} style={{ background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.lg, padding: 16, display: "flex", flexDirection: "column", gap: 8, boxShadow: BRAND.shadowSm }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ fontSize: 26 }}>{catIcon(it.categoria)}</div>
                    <Chip color={BRAND.graphite} bg={BRAND.beigeDeep}>{catLabel(it.categoria)}</Chip>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 14.5, color: BRAND.charcoal, lineHeight: 1.25 }}>{it.nombre}</div>
                  <div style={{ fontSize: 12, color: BRAND.stone }}>🏪 {provName(it.proveedorId)}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto" }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: GREEN }}>{fmtL(it.precio)}</div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: sinStock ? BRAND.red : bajo ? BRAND.yellow : BRAND.graphite }}>
                      {sinStock ? "Sin stock" : `Stock: ${it.stock}${bajo ? " ⚠" : ""}`}
                    </div>
                  </div>
                  {!readOnly && (
                    <Btn onClick={() => addToCart(it)} style={{ width: "100%" }}>🛒 Agregar al carrito</Btn>
                  )}
                  {canManage && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <Btn small variant="ghost" style={{ flex: 1 }} onClick={() => setModal({ t: "item", item: it })}>✏️ Editar</Btn>
                    </div>
                  )}
                </div>
              );
            })}
            {!vis.length && <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 30, color: BRAND.stone, fontSize: 13 }}>Sin resultados con esos filtros.</div>}
          </div>
        )}
      </div>
    );
  };

  const CartModal = () => (
    <Modal title={`🛒 Carrito de EPP (${cartCount})`} onClose={() => setModal(null)} width={820}>
      {!cart.length ? (
        <div style={{ textAlign: "center", padding: 30, color: BRAND.stone }}>El carrito está vacío. Agregá EPP desde el catálogo.</div>
      ) : (
        <>
          <div style={{ background: BRAND.blueSoft, border: `1px solid ${BRAND.blue}30`, borderRadius: R.md, padding: "10px 14px", fontSize: 12.5, color: BRAND.ink, marginBottom: 14 }}>
            Indicá <b>para qué colaborador</b> es cada ítem y el <b>motivo</b>. Si es <b style={{ color: BRAND.red }}>pérdida/extravío</b>, quedará marcado para deducirse en planilla.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {cart.map((l) => {
              const it = items.find((i) => i.id === l.itemId) || {};
              return (
                <div key={l.key} style={{ background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.md, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 10 }}>
                    <div style={{ fontWeight: 800, fontSize: 13.5, color: BRAND.charcoal }}>{catIcon(it.categoria)} {it.nombre} <span style={{ fontWeight: 600, color: GREEN }}>· {fmtL(it.precio)}</span></div>
                    <button onClick={() => setCart((c) => c.filter((x) => x !== l))} style={{ background: "none", border: "none", color: BRAND.red, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Quitar</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr", gap: 10 }}>
                    <Input label="Cant." type="number" min="1" value={l.qty} onChange={(e) => setCart((c) => c.map((x) => (x === l ? { ...x, qty: e.target.value } : x)))} />
                    <Select label="Para (colaborador)" placeholder="— Seleccionar —" value={l.paraEmpId} onChange={(e) => setCart((c) => c.map((x) => (x === l ? { ...x, paraEmpId: e.target.value } : x)))}
                      options={activeEmps.map((e) => ({ value: e.id, label: `${e.fullName} · ${coTag(e.company)}` }))} />
                    <Select label="Motivo" placeholder="— Seleccionar —" value={l.motivo} onChange={(e) => setCart((c) => c.map((x) => (x === l ? { ...x, motivo: e.target.value } : x)))}
                      options={MOTIVOS.map((m) => ({ value: m.value, label: m.label }))} />
                  </div>
                  {l.motivo === "perdida" && (
                    <div style={{ marginTop: 8, background: BRAND.redSoft, border: `1px solid ${BRAND.red}40`, borderRadius: R.sm, padding: "7px 10px", fontSize: 12, fontWeight: 700, color: BRAND.red }}>
                      ⚠ Pérdida/extravío: {fmtL((Number(it.precio) || 0) * (Number(l.qty) || 1))} se deducirán de la planilla de {empById(l.paraEmpId)?.fullName || "el colaborador"}.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: BRAND.charcoal }}>
              Total: <span style={{ color: GREEN }}>{fmtL(cart.reduce((s, l) => s + (Number(items.find((i) => i.id === l.itemId)?.precio) || 0) * (Number(l.qty) || 0), 0))}</span>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn variant="ghost" onClick={() => setModal(null)}>Seguir viendo</Btn>
              <Btn variant="success" onClick={enviarRequisicion}>📨 Enviar requisición</Btn>
            </div>
          </div>
        </>
      )}
    </Modal>
  );

  const renderRequisiciones = () => {
    const vis = reqs.filter((r) => !fReqEstado || r.estado === fReqEstado);
    return (
      <div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ flex: "0 1 220px" }}>
            <Select label="Estado" placeholder="Todos" value={fReqEstado} onChange={(e) => setFReqEstado(e.target.value)}
              options={Object.entries(ESTADOS).map(([v, d]) => ({ value: v, label: d.label }))} />
          </div>
          <div style={{ fontSize: 12.5, color: BRAND.stone, paddingBottom: 10 }}>{vis.length} requisición(es)</div>
        </div>
        {!vis.length && <div style={{ textAlign: "center", padding: 50, color: BRAND.stone, background: "#fff", borderRadius: R.lg, border: `1px dashed ${BRAND.border}` }}>Sin requisiciones todavía. Se crean desde el catálogo con el carrito 🛒.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {vis.map((r) => {
            const est = ESTADOS[r.estado] || ESTADOS.pendiente;
            const tienePerdida = (r.lineas || []).some((l) => l.motivo === "perdida");
            return (
              <div key={r.id} style={{ background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.lg, overflow: "hidden", boxShadow: BRAND.shadowSm }}>
                {tienePerdida && (
                  <div style={{ background: BRAND.redSoft, borderBottom: `1px solid ${BRAND.red}30`, padding: "7px 16px", fontSize: 12, fontWeight: 800, color: BRAND.red }}>
                    ⚠ CONTIENE PÉRDIDA/EXTRAVÍO — genera descuento en planilla
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 16px", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: FONT.mono, fontWeight: 800, fontSize: 14, color: BRAND.orange }}>{r.numero}</span>
                    <Chip color={est.color} bg={est.bg}>{est.label}</Chip>
                    <span style={{ fontSize: 12.5, color: BRAND.graphite }}>Solicitó: <b>{r.solicitante}</b> · {fmtDate(r.fecha)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontWeight: 800, color: GREEN, fontSize: 14 }}>{fmtL(r.total)}</span>
                    {canManage && r.estado === "pendiente" && <>
                      <Btn small variant="success" onClick={() => setEstadoReq(r, "aprobada")}>✓ Aprobar</Btn>
                      <Btn small variant="danger" onClick={() => setEstadoReq(r, "rechazada")}>✕ Rechazar</Btn>
                    </>}
                    {canManage && r.estado === "aprobada" && <Btn small variant="info" onClick={() => setEstadoReq(r, "entregada")}>📦 Marcar entregada</Btn>}
                    {userRole === "admin" && <Btn small variant="ghost" style={{ color: BRAND.red }} onClick={async () => {
                      if (!confirm(`¿ELIMINAR la requisición ${r.numero}?\n\nSe borra del historial (incluye sus descuentos de planilla). Esta acción no se puede deshacer.`)) return;
                      await sReqs(reqs.filter((x) => x.id !== r.id));
                    }}>🗑</Btn>}
                  </div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr style={{ background: BRAND.beigeLight }}>
                      <th style={th}>Ítem</th><th style={th}>Categoría</th><th style={th}>Proveedor</th><th style={th}>Para</th><th style={th}>Motivo</th>
                      <th style={{ ...th, textAlign: "right" }}>Cant.</th><th style={{ ...th, textAlign: "right" }}>Precio</th><th style={{ ...th, textAlign: "right" }}>Subtotal</th>
                    </tr></thead>
                    <tbody>
                      {(r.lineas || []).map((l, i) => {
                        const m = motivoDef(l.motivo);
                        return (
                          <tr key={i}>
                            <td style={{ ...td, fontWeight: 700 }}>{l.nombre}</td>
                            <td style={td}>{catLabel(l.categoria)}</td>
                            <td style={td}>{l.proveedor}</td>
                            <td style={td}>{l.paraNombre} <span style={{ fontSize: 10, color: BRAND.stone, fontWeight: 700 }}>{l.paraEmpresa ? coTag(l.paraEmpresa) : ""}</span></td>
                            <td style={td}><Chip color={m.color} bg={m.bg}>{m.chip}</Chip>{l.motivo === "perdida" && l.deducido && <Chip color={GREEN} bg={BRAND.greenSoft} style={{ marginLeft: 5 }}>DEDUCIDO ✓</Chip>}</td>
                            <td style={{ ...td, textAlign: "right" }}>{l.qty}</td>
                            <td style={{ ...td, textAlign: "right" }}>{fmtL(l.precio)}</td>
                            <td style={{ ...td, textAlign: "right", fontWeight: 700, color: GREEN }}>{fmtL(l.precio * l.qty)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderInventario = () => {
    const sorted = [...items].sort((a, b) => String(a.categoria).localeCompare(b.categoria) || String(a.nombre).localeCompare(b.nombre));
    const valorTotal = items.reduce((s, i) => s + (Number(i.precio) || 0) * (Number(i.stock) || 0), 0);
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 13, color: BRAND.graphite }}>{items.length} ítems · Valor del inventario: <b style={{ color: GREEN }}>{fmtL(valorTotal)}</b></div>
          {canManage && <Btn onClick={() => setModal({ t: "item" })}>+ Nuevo ítem</Btn>}
        </div>
        <div style={{ background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.lg, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: BRAND.beigeLight }}>
                <th style={th}>Ítem</th><th style={th}>Categoría</th><th style={th}>Proveedor</th>
                <th style={{ ...th, textAlign: "right" }}>Precio</th><th style={{ ...th, textAlign: "right" }}>Stock</th><th style={{ ...th, textAlign: "right" }}>Mín.</th>
                {canManage && <th style={{ ...th, textAlign: "right" }}>Acciones</th>}
              </tr></thead>
              <tbody>
                {sorted.map((it) => {
                  const sinStock = (Number(it.stock) || 0) <= 0;
                  const bajo = (Number(it.stock) || 0) <= (Number(it.minStock) || 0);
                  return (
                    <tr key={it.id} style={{ background: sinStock ? BRAND.redSoft : bajo ? BRAND.yellowSoft : "transparent" }}>
                      <td style={{ ...td, fontWeight: 700 }}>{catIcon(it.categoria)} {it.nombre}</td>
                      <td style={td}>{catLabel(it.categoria)}</td>
                      <td style={td}>{provName(it.proveedorId)}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700, color: GREEN }}>{fmtL(it.precio)}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 800, color: sinStock ? BRAND.red : bajo ? "#B45309" : BRAND.charcoal }}>{Number(it.stock) || 0}{bajo && " ⚠"}</td>
                      <td style={{ ...td, textAlign: "right", color: BRAND.stone }}>{Number(it.minStock) || 0}</td>
                      {canManage && (
                        <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                          <Btn small variant="ghost" onClick={() => setModal({ t: "item", item: it })}>✏️</Btn>{" "}
                          <Btn small variant="ghost" style={{ color: BRAND.red }} onClick={async () => {
                            if (!confirm(`¿Borrar "${it.nombre}" del catálogo?\n\nLas requisiciones ya creadas no se tocan.`)) return;
                            await sItems(items.filter((x) => x.id !== it.id));
                          }}>🗑</Btn>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {!items.length && <tr><td style={{ ...td, textAlign: "center", color: BRAND.stone, padding: 30 }} colSpan={canManage ? 7 : 6}>Sin ítems. Agregalos con "+ Nuevo ítem".</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const ItemForm = ({ item }) => {
    const [f, setF] = useState(item || { nombre: "", categoria: "", proveedorId: "", precio: "", stock: 0, minStock: 2 });
    const u = (k, v) => setF((p) => ({ ...p, [k]: v }));
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ gridColumn: "1/-1" }}><Input label="Nombre del ítem" placeholder="Ej: Casco tipo I con barbiquejo" value={f.nombre} onChange={(e) => u("nombre", e.target.value)} /></div>
        <Select label="Categoría" placeholder="— Seleccionar —" options={CATEGORIAS} value={f.categoria} onChange={(e) => u("categoria", e.target.value)} />
        <Select label="Proveedor" placeholder="— Seleccionar —" options={providers.map((p) => ({ value: p.id, label: p.nombre }))} value={f.proveedorId} onChange={(e) => u("proveedorId", e.target.value)} />
        <Input label="Precio real (L)" type="number" min="0" step="0.01" value={f.precio} onChange={(e) => u("precio", e.target.value)} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Input label="Stock actual" type="number" min="0" value={f.stock} onChange={(e) => u("stock", e.target.value)} />
          <Input label="Stock mínimo" type="number" min="0" value={f.minStock} onChange={(e) => u("minStock", e.target.value)} />
        </div>
        {!providers.length && <div style={{ gridColumn: "1/-1", background: BRAND.yellowSoft, borderRadius: R.sm, padding: "8px 12px", fontSize: 12.5, color: "#8a6d0b" }}>⚠ No hay proveedores cargados — andá a la pestaña Proveedores primero.</div>}
        <div style={{ gridColumn: "1/-1", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
          <Btn variant="success" onClick={async () => {
            if (!f.nombre.trim()) return alert("Poné el nombre del ítem.");
            if (!f.categoria) return alert("Seleccioná la categoría.");
            if (!f.proveedorId) return alert("Seleccioná el proveedor.");
            if (f.precio === "" || Number(f.precio) < 0) return alert("Poné el precio real.");
            const rec = { ...f, precio: Number(f.precio), stock: Number(f.stock) || 0, minStock: Number(f.minStock) || 0, id: f.id || uid() };
            const ok = await sItems(item ? items.map((x) => (x.id === rec.id ? rec : x)) : [...items, rec]);
            if (ok) setModal(null);
          }}>{item ? "Guardar cambios" : "Agregar al catálogo"}</Btn>
        </div>
      </div>
    );
  };

  const renderProveedores = () => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 13, color: BRAND.graphite }}>{providers.length} proveedor(es) de EPP</div>
        {canManage && (
          <div style={{ display: "flex", gap: 8 }}>
            {!providers.length && (
              <Btn variant="info" onClick={async () => {
                if (!confirm("¿Cargar los 6 proveedores iniciales?\n\n" + PROV_SEED.join(" · "))) return;
                await sProv(PROV_SEED.map((n) => ({ id: uid(), nombre: n, contacto: "", telefono: "", correo: "", notas: "" })));
              }}>⚡ Cargar los 6 proveedores</Btn>
            )}
            <Btn onClick={() => setModal({ t: "prov" })}>+ Nuevo proveedor</Btn>
          </div>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {providers.map((p) => {
          const nItems = items.filter((i) => i.proveedorId === p.id).length;
          return (
            <div key={p.id} style={{ background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.lg, padding: 16, boxShadow: BRAND.shadowSm }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: BRAND.charcoal }}>🏪 {p.nombre}</div>
                {canManage && (
                  <div style={{ display: "flex", gap: 4 }}>
                    <Btn small variant="ghost" onClick={() => setModal({ t: "prov", prov: p })}>✏️</Btn>
                    <Btn small variant="ghost" style={{ color: BRAND.red }} onClick={async () => {
                      if (nItems && !confirm(`"${p.nombre}" tiene ${nItems} ítem(s) en el catálogo que quedarían sin proveedor.\n\n¿Borrar de todos modos?`)) return;
                      if (!nItems && !confirm(`¿Borrar al proveedor "${p.nombre}"?`)) return;
                      await sProv(providers.filter((x) => x.id !== p.id));
                    }}>🗑</Btn>
                  </div>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: BRAND.graphite, marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
                {p.contacto && <div>👤 {p.contacto}</div>}
                {p.telefono && <div>📞 {p.telefono}</div>}
                {p.correo && <div>✉️ {p.correo}</div>}
                {p.notas && <div style={{ color: BRAND.stone }}>{p.notas}</div>}
              </div>
              <div style={{ marginTop: 10 }}><Chip color={BRAND.orange} bg={BRAND.orangeBg}>{nItems} ÍTEM(S) EN CATÁLOGO</Chip></div>
            </div>
          );
        })}
        {!providers.length && <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 50, color: BRAND.stone, background: "#fff", borderRadius: R.lg, border: `1px dashed ${BRAND.border}` }}>Sin proveedores. {canManage ? "Usá \"⚡ Cargar los 6 proveedores\" para arrancar." : ""}</div>}
      </div>
    </div>
  );

  const ProvForm = ({ prov }) => {
    const [f, setF] = useState(prov || { nombre: "", contacto: "", telefono: "", correo: "", notas: "" });
    const u = (k, v) => setF((p) => ({ ...p, [k]: v }));
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ gridColumn: "1/-1" }}><Input label="Nombre" value={f.nombre} onChange={(e) => u("nombre", e.target.value)} /></div>
        <Input label="Contacto" value={f.contacto} onChange={(e) => u("contacto", e.target.value)} />
        <Input label="Teléfono" value={f.telefono} onChange={(e) => u("telefono", e.target.value)} />
        <div style={{ gridColumn: "1/-1" }}><Input label="Correo" value={f.correo} onChange={(e) => u("correo", e.target.value)} /></div>
        <div style={{ gridColumn: "1/-1" }}><Input label="Notas" value={f.notas} onChange={(e) => u("notas", e.target.value)} /></div>
        <div style={{ gridColumn: "1/-1", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
          <Btn variant="success" onClick={async () => {
            if (!f.nombre.trim()) return alert("Poné el nombre del proveedor.");
            const rec = { ...f, id: f.id || uid() };
            const ok = await sProv(prov ? providers.map((x) => (x.id === rec.id ? rec : x)) : [...providers, rec]);
            if (ok) setModal(null);
          }}>{prov ? "Guardar cambios" : "Agregar proveedor"}</Btn>
        </div>
      </div>
    );
  };

  const renderDescuentos = () => {
    const totalPend = perdidasPend.reduce((s, p) => s + p.linea.precio * p.linea.qty, 0);
    return (
      <div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
          <div style={{ flex: "1 1 200px", background: "#fff", border: `1px solid ${BRAND.border}`, borderLeft: `4px solid ${BRAND.red}`, borderRadius: R.md, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.graphite, textTransform: "uppercase", letterSpacing: 0.5 }}>Pendiente de deducir</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: BRAND.red, marginTop: 4 }}>{fmtL(totalPend)}</div>
            <div style={{ fontSize: 12, color: BRAND.stone }}>{perdidasPend.length} pérdida(s) sin deducir</div>
          </div>
          <div style={{ flex: "1 1 200px", background: "#fff", border: `1px solid ${BRAND.border}`, borderLeft: `4px solid ${GREEN}`, borderRadius: R.md, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.graphite, textTransform: "uppercase", letterSpacing: 0.5 }}>Ya deducidas</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: GREEN, marginTop: 4 }}>{perdidas.length - perdidasPend.length}</div>
            <div style={{ fontSize: 12, color: BRAND.stone }}>histórico de descuentos aplicados</div>
          </div>
        </div>
        <div style={{ background: BRAND.redSoft, border: `1px solid ${BRAND.red}30`, borderRadius: R.md, padding: "10px 14px", fontSize: 12.5, color: BRAND.ink, marginBottom: 14 }}>
          ⚠ Cada EPP solicitado por <b>pérdida/extravío</b> aparece acá para que se <b>deduzca de la planilla</b> del colaborador. Cuando tesorería lo aplique, se marca "Deducido".
        </div>
        <div style={{ background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.lg, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: BRAND.beigeLight }}>
                <th style={th}>Fecha</th><th style={th}>Colaborador</th><th style={th}>Ítem perdido</th><th style={th}>Requisición</th>
                <th style={{ ...th, textAlign: "right" }}>Cant.</th><th style={{ ...th, textAlign: "right" }}>A deducir</th><th style={th}>Estado</th>
                {canDeduct && <th style={{ ...th, textAlign: "right" }}>Acción</th>}
              </tr></thead>
              <tbody>
                {perdidas.map(({ req, linea, idx }) => (
                  <tr key={req.id + "-" + idx} style={{ background: linea.deducido ? "transparent" : BRAND.redSoft }}>
                    <td style={td}>{fmtDate(req.fecha)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{linea.paraNombre} <span style={{ fontSize: 10, color: BRAND.stone, fontWeight: 700 }}>{linea.paraEmpresa ? coTag(linea.paraEmpresa) : ""}</span></td>
                    <td style={td}>{catIcon(linea.categoria)} {linea.nombre}</td>
                    <td style={{ ...td, fontFamily: FONT.mono, fontWeight: 700, color: BRAND.orange }}>{req.numero}</td>
                    <td style={{ ...td, textAlign: "right" }}>{linea.qty}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 800, color: BRAND.red }}>{fmtL(linea.precio * linea.qty)}</td>
                    <td style={td}>{linea.deducido
                      ? <Chip color={GREEN} bg={BRAND.greenSoft}>DEDUCIDO ✓{linea.deducidoPor ? ` · ${linea.deducidoPor}` : ""}</Chip>
                      : <Chip color={BRAND.red} bg={BRAND.redSoft}>PENDIENTE</Chip>}</td>
                    {canDeduct && (
                      <td style={{ ...td, textAlign: "right" }}>
                        <Btn small variant={linea.deducido ? "ghost" : "success"} onClick={() => {
                          if (!linea.deducido && !confirm(`¿Marcar como DEDUCIDO en planilla?\n\n${linea.paraNombre} — ${linea.nombre} (${fmtL(linea.precio * linea.qty)})`)) return;
                          toggleDeducido(req.id, idx);
                        }}>{linea.deducido ? "↩ Revertir" : "✓ Deducido en planilla"}</Btn>
                      </td>
                    )}
                  </tr>
                ))}
                {!perdidas.length && <tr><td style={{ ...td, textAlign: "center", color: BRAND.stone, padding: 30 }} colSpan={canDeduct ? 8 : 7}>Sin pérdidas registradas. 🎉</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ══════════════════════════ LAYOUT ══════════════════════════
  const TABS = [
    { id: "catalogo", label: "🛒 Catálogo" },
    { id: "requisiciones", label: "📋 Requisiciones", badge: reqsPendientes },
    { id: "inventario", label: "📦 Inventario" },
    { id: "proveedores", label: "🏪 Proveedores" },
    { id: "descuentos", label: "⚠️ Descuentos planilla", badge: perdidasPend.length, badgeColor: BRAND.red },
  ];

  return (
    <div style={{ minHeight: "100vh", background: BRAND.beige, fontFamily: FONT.body }}>
      {/* Header */}
      <div style={{ background: "#fff", borderBottom: `1px solid ${BRAND.border}`, padding: "14px 26px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: R.md, background: "#B45309", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21 }}>🦺</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: BRAND.charcoal, fontFamily: FONT.display }}>GeoSafety</div>
            <div style={{ fontSize: 11.5, color: BRAND.stone }}>EPP · Catálogo, inventario y requisiciones — Grupo Geotecnica</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!readOnly && (
            <Btn variant={cartCount ? "primary" : "ghost"} onClick={() => setModal({ t: "cart" })}>🛒 Carrito{cartCount ? ` (${cartCount})` : ""}</Btn>
          )}
          <span style={{ fontSize: 12.5, color: BRAND.graphite, fontWeight: 600 }}>{userName}</span>
          <Btn variant="ghost" onClick={onBack}>← Módulos</Btn>
          <Btn variant="ghost" onClick={onLogout}>Salir</Btn>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, padding: "14px 26px 0", flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setSec(t.id)} style={{
            padding: "9px 16px", borderRadius: `${R.md}px ${R.md}px 0 0`, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT.body,
            border: `1px solid ${sec === t.id ? BRAND.border : "transparent"}`, borderBottom: "none",
            background: sec === t.id ? "#fff" : "transparent", color: sec === t.id ? BRAND.orange : BRAND.graphite,
          }}>
            {t.label}{t.badge ? <span style={{ marginLeft: 6, background: t.badgeColor || BRAND.orange, color: "#fff", borderRadius: R.full, padding: "1px 7px", fontSize: 10.5, fontWeight: 800 }}>{t.badge}</span> : null}
          </button>
        ))}
      </div>

      <div style={{ padding: "20px 26px 60px", maxWidth: 1280, margin: "0 auto" }}>
        {!loaded ? (
          <div style={{ textAlign: "center", padding: 60, color: BRAND.stone }}>Cargando GeoSafety…</div>
        ) : (
          <>
            {sec === "catalogo" && renderCatalogo()}
            {sec === "requisiciones" && renderRequisiciones()}
            {sec === "inventario" && renderInventario()}
            {sec === "proveedores" && renderProveedores()}
            {sec === "descuentos" && renderDescuentos()}
          </>
        )}
      </div>

      {/* Modales */}
      {modal?.t === "cart" && <CartModal />}
      {modal?.t === "item" && <Modal title={modal.item ? "Editar ítem" : "Nuevo ítem de EPP"} onClose={() => setModal(null)}><ItemForm item={modal.item} /></Modal>}
      {modal?.t === "prov" && <Modal title={modal.prov ? "Editar proveedor" : "Nuevo proveedor"} onClose={() => setModal(null)} width={520}><ProvForm prov={modal.prov} /></Modal>}
    </div>
  );
}
