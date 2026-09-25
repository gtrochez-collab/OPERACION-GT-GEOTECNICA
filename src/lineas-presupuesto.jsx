// ═══════════════════════════════════════════════════════════════════════════
// ÍTEMS DEL PRESUPUESTO en una solicitud (25-sep-2026, pedido de Gerson)
// ═══════════════════════════════════════════════════════════════════════════
// Antes la solicitud llevaba UNA sola partida y el "qué se compra" era texto
// libre. Pero una cotización trae varias cosas que en el presupuesto del PM
// son partidas DISTINTAS (MAT-2026-0422: tubo PVC 4" + poliducto negro), y no
// había forma de cargarla bien. Gerson: "en vez de tipear según la cotización,
// que permita seleccionar ítems que están cargados en el presupuesto — solo se
// debería comprar lo que está en la receta del pastel".
//
// Flujo: se elige la categoría (Generales · Materiales · Equipos · Otros…) y
// de ahí los ítems de ESA categoría que están en el presupuesto, cada uno con
// su cantidad y su monto en L tal cual la cotización. El monto que manda es el
// TOTAL de la solicitud (lo que paga Tesorería): cada partida se lleva la
// proporción de su ítem (repartirLineas en geocost-calc.js), así el ISV o el
// flete se reparten solos.
//
// Lo usan: el form de solicitud y la corrección de pagadas (GeoShopping) y
// "Dividir en ítems" de GeoCost. Vive a NIVEL DE MÓDULO (regla de la casa).
// ═══════════════════════════════════════════════════════════════════════════
import { useState } from "react";
import { num, hnlToUsd, partidasParaModulo, repartirLineas, lineasValidas, CATEGORIAS } from "./geocost-calc.js";
const solDe = (p) => String(p?.solucion || "").trim();

const ORANGE_DARK = "#C75F1F";
const C_VERDE = { color: "#177243" };
const C_AMARILLO = { color: "#8A5A00", bg: "#FBEFC4" };
const C_ULTRA = { color: "#A94E16", bg: "rgba(232,118,45,.10)", borde: "rgba(232,118,45,.30)" };
const uidL = () => "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const r2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;
const nf2 = (n) => Number(n || 0).toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fL = (n) => `L ${nf2(n)}`;
const fU = (n) => `$ ${nf2(n)}`;

// Partidas que se pueden comprar desde Solicitudes (módulo compras + libre +
// movilización), más las que la solicitud ya trae aunque hoy no califiquen
// (reclasificadas desde GeoCost) — para no perderlas al editar.
const partidasCompra = (pres, lineas) => {
  const base = partidasParaModulo(pres, "compras");
  const ids = new Set(base.map(p => p.id));
  const extra = (pres?.partidas || []).filter(p => !ids.has(p.id) && (lineas || []).some(l => l.partidaId === p.id));
  return [...base, ...extra];
};
const categoriasDe = (partidas) => {
  const vistas = [...new Set(partidas.map(p => p.categoria || "Otros"))];
  return [...CATEGORIAS.filter(c => vistas.includes(c)), ...vistas.filter(c => !CATEGORIAS.includes(c))];
};

// ¿El presupuesto tiene algo que se pueda comprar? (si no, el form sigue como antes)
export const hayItemsComprables = (pres) => partidasParaModulo(pres, "compras").length > 0;

// Lo que el form necesita para validar y guardar. `disponibleDe(partidaId)`
// devuelve {disponibleUSD} SIN contar esta misma compra.
export const evaluarLineas = ({ pres, lineas, montoTotal, tasa, disponibleDe }) => {
  const ps = pres?.partidas || [];
  const byId = new Map(ps.map(p => [p.id, p]));
  const todas = (lineas || []).filter(Boolean);
  const validas = todas.filter(l => l.partidaId && byId.has(l.partidaId) && num(l.monto) > 0);
  const incompletas = todas.filter(l => !(l.partidaId && byId.has(l.partidaId) && num(l.monto) > 0) && (l.partidaId || num(l.monto) > 0 || num(l.cantidad) > 0));
  const suma = r2(validas.reduce((s, l) => s + num(l.monto), 0));
  const total = num(montoTotal) > 0 ? num(montoTotal) : suma;
  const acc = new Map();
  repartirLineas(validas, total).forEach(l => acc.set(l.partidaId, r2((acc.get(l.partidaId) || 0) + l.montoHNL)));
  const porPartida = [...acc.entries()].map(([partidaId, montoHNL]) => {
    const p = byId.get(partidaId);
    const usd = hnlToUsd(montoHNL, tasa);
    const disp = disponibleDe ? disponibleDe(partidaId) : null;
    const sobregiroUSD = disp && usd > num(disp.disponibleUSD) ? usd - num(disp.disponibleUSD) : 0;
    return { partidaId, nombre: p?.nombre || "", montoHNL, usd, disponibleUSD: disp ? num(disp.disponibleUSD) : null, sobregiroUSD };
  });
  const sobregiroUSD = porPartida.reduce((s, x) => s + x.sobregiroUSD, 0);
  // La partida principal (la de más plata) se guarda también en `partidaId`
  // para lo que todavía lee UNA sola partida (compatibilidad).
  const principal = porPartida.slice().sort((a, b) => b.montoHNL - a.montoHNL)[0]?.partidaId || "";
  return { validas, incompletas, suma, total, porPartida, sobregiroUSD, principal };
};

// Error de validación (null = OK). Lo comparten los dos botones del form.
export const errorLineas = (ev, { justificacion = "", montoTotal } = {}) => {
  if (!ev.validas.length) return "Agregá al menos un ítem del presupuesto, con su monto";
  if (ev.incompletas.length) return "Hay ítems sin elegir o sin monto — completalos o quitalos";
  if (num(montoTotal) > 0 && ev.suma > num(montoTotal) * 1.005 + 0.5) return `Los ítems suman ${fL(ev.suma)}, más que el monto total (${fL(montoTotal)}) — revisá los montos`;
  if (ev.sobregiroUSD > 0 && String(justificacion || "").trim().length < 5) return "Sobrepasa el presupuesto: escribí la justificación del sobregiro (mínimo 5 caracteres)";
  return null;
};

// Las líneas tal cual se guardan: nombre y unidad van copiados para que la
// descripción, la ficha y los reportes se lean aunque el PM cambie el
// presupuesto después.
export const lineasParaGuardar = (pres, lineas) => {
  const byId = new Map((pres?.partidas || []).map(p => [p.id, p]));
  return (lineas || []).filter(l => l && l.partidaId && byId.has(l.partidaId) && num(l.monto) > 0).map(l => {
    const p = byId.get(l.partidaId);
    return { id: l.id && l.id !== "legacy" ? l.id : uidL(), partidaId: l.partidaId, ...(solDe(p) ? { solucion: solDe(p) } : {}), categoria: p.categoria || "Otros", nombre: p.nombre || "", unidad: p.unidad || "", cantidad: num(l.cantidad), monto: r2(num(l.monto)) };
  });
};
// "5 Lance × Varilla No.3…" — un renglón por ítem. Es lo que leen la tabla,
// la ficha de entrega, los despachos y los reportes (campo `description`).
export const descripcionDeLineas = (lineas) => (lineas || []).map(l => {
  const cant = num(l.cantidad) > 0 ? `${num(l.cantidad).toLocaleString("es-HN")}${l.unidad ? " " + l.unidad : ""} × ` : "";
  return `${cant}${l.nombre || ""}`.trim();
}).filter(Boolean).join("\n");

// Una compra vieja con UNA partida se abre como un solo ítem por el total.
export const lineasIniciales = (purchase) => {
  const ls = Array.isArray(purchase?.lineas) ? purchase.lineas : [];
  if (ls.length) return ls.map(l => ({ id: l.id || uidL(), partidaId: l.partidaId || "", cantidad: l.cantidad ? String(l.cantidad) : "", monto: l.monto ? String(l.monto) : "", categoria: l.categoria }));
  if (purchase?.partidaId) return [{ id: "legacy", partidaId: purchase.partidaId, cantidad: "", monto: purchase.amount ? String(purchase.amount) : "" }];
  return [];
};
export { lineasValidas };

const INPUT = { padding: "8px 11px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 13.5, background: "#F8FAFC", fontFamily: "inherit", outline: "none", minWidth: 0, width: "100%", boxSizing: "border-box" };
const LBL = { fontSize: 12, fontWeight: 600, color: "#475569" };

export function LineasPresupuesto({ pres, lineas, onChange, montoTotal, tasa, disponibleDe, isMobile = false }) {
  const partidas = partidasCompra(pres, lineas);
  const byId = new Map(partidas.map(p => [p.id, p]));
  // SOLUCIONES (25-sep-2026): si el presupuesto viene dividido (Muro anclado ·
  // Pantalla de pilotes…), primero se elige la solución y después la categoría
  // — el mismo ítem puede estar en varias y cada una tiene su presupuesto.
  const sols = [...new Set(partidas.map(solDe).filter(Boolean))];
  const multi = sols.length > 1;
  const primera = (lineas || []).map(l => byId.get(l.partidaId)).find(Boolean);
  const [sol, setSol] = useState(() => (primera && solDe(primera)) || sols[0] || "");
  const solEf = multi ? (sols.includes(sol) ? sol : sols[0]) : "";
  const deSol = multi ? partidas.filter(p => solDe(p) === solEf) : partidas;
  const cats = categoriasDe(deSol);
  const [catSel, setCat] = useState(() => primera?.categoria || "Materiales");
  const cat = cats.includes(catSel) ? catSel : (cats.includes("Materiales") ? "Materiales" : cats[0]) || "Otros";
  const ev = evaluarLineas({ pres, lineas, montoTotal, tasa, disponibleDe });
  const upd = (id, k, v) => onChange((lineas || []).map(l => l.id === id ? { ...l, [k]: v } : l));
  const quitar = (id) => onChange((lineas || []).filter(l => l.id !== id));
  const agregar = () => onChange([...(lineas || []), { id: uidL(), partidaId: "", cantidad: "", monto: "", categoria: cat, solucion: solEf }]);
  const catDeLinea = (l) => byId.get(l.partidaId)?.categoria || l.categoria || cat;
  const solDeLinea = (l) => multi ? (solDe(byId.get(l.partidaId)) || l.solucion || solEf) : "";
  const dif = num(montoTotal) > 0 ? r2(num(montoTotal) - ev.suma) : 0;

  return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={LBL}>Qué se compra — ítems del presupuesto *</label>
      {multi && <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: .4, marginRight: 2 }}>Solución</span>
        {sols.map(x => {
          const activo = x === solEf;
          return <button key={x} type="button" onClick={() => setSol(x)} aria-pressed={activo}
            style={{ padding: "6px 14px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 800,
              border: activo ? "1px solid transparent" : "1px solid #CBD5E1", background: activo ? "#2C2A28" : "#F8FAFC", color: activo ? "#fff" : "#475569" }}>{x}</button>;
        })}
      </div>}
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        {cats.map(c => {
          const activo = c === cat;
          const n = deSol.filter(p => (p.categoria || "Otros") === c).length;
          return <button key={c} type="button" onClick={() => setCat(c)} aria-pressed={activo}
            style={{ padding: "6px 14px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 800,
              border: activo ? "1px solid transparent" : "1px solid #CBD5E1", background: activo ? ORANGE_DARK : "#F8FAFC", color: activo ? "#fff" : "#475569" }}>
            {c} <span style={{ opacity: .7, fontWeight: 600 }}>{n}</span>
          </button>;
        })}
      </div>
    </div>

    {(lineas || []).length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {!isMobile && <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 120px 140px 28px", gap: 8, fontSize: 10.5, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: .4, padding: "0 2px" }}>
        <span>Ítem</span><span>Cantidad</span><span>Monto (L)</span><span />
      </div>}
      {(lineas || []).map(l => {
        const p = byId.get(l.partidaId);
        const c = catDeLinea(l);
        const sl = solDeLinea(l);
        const opciones = partidas.filter(x => (x.categoria || "Otros") === c && (!multi || solDe(x) === sl));
        const disp = l.partidaId && disponibleDe ? disponibleDe(l.partidaId) : null;
        const pp = ev.porPartida.find(x => x.partidaId === l.partidaId);
        return <div key={l.id} style={{ display: "flex", flexDirection: "column", gap: 4, background: pp?.sobregiroUSD > 0 ? C_ULTRA.bg : "transparent", borderRadius: 10, padding: 6, margin: -6 }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr) 28px" : "minmax(0,1fr) 120px 140px 28px", gap: 8, alignItems: "center" }}>
            <select value={l.partidaId || ""} onChange={e => upd(l.id, "partidaId", e.target.value)} style={{ ...INPUT, gridColumn: isMobile ? "1" : undefined, color: l.partidaId ? "#0f172a" : "#94A3B8" }}>
              <option value="">— Elegí el ítem ({multi ? `${sl} · ${c}` : c}) —</option>
              {opciones.map(x => <option key={x.id} value={x.id}>{x.nombre}{x.unidad ? ` · ${x.unidad}` : ""}</option>)}
            </select>
            {isMobile && <button type="button" onClick={() => quitar(l.id)} title="Quitar ítem" style={{ background: "none", border: "none", color: "#94A3B8", fontSize: 16, cursor: "pointer", padding: 0 }}>✕</button>}
            <div style={{ position: "relative", gridColumn: isMobile ? "1 / -1" : undefined }}>
              <input type="number" step="any" min="0" value={l.cantidad} onChange={e => upd(l.id, "cantidad", e.target.value)} placeholder="Cant." style={{ ...INPUT, paddingRight: p?.unidad ? 54 : 11 }} />
              {p?.unidad && <span style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#94A3B8", fontWeight: 700, pointerEvents: "none", maxWidth: 48, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.unidad}</span>}
            </div>
            <input type="number" step="0.01" min="0" value={l.monto} onChange={e => upd(l.id, "monto", e.target.value)} placeholder="0.00" style={{ ...INPUT, gridColumn: isMobile ? "1 / -1" : undefined }} />
            {!isMobile && <button type="button" onClick={() => quitar(l.id)} title="Quitar ítem" style={{ background: "none", border: "none", color: "#94A3B8", fontSize: 16, cursor: "pointer", padding: 0 }}>✕</button>}
          </div>
          {disp && <div style={{ fontSize: 11, fontWeight: 600, color: num(disp.disponibleUSD) >= 0 ? C_VERDE.color : C_AMARILLO.color, paddingLeft: 2 }}>
            {multi && <span style={{ color: "#64748b" }}>{sl} · </span>}Disponible en el presupuesto: {fU(disp.disponibleUSD)} · {fL(num(disp.disponibleUSD) * num(tasa))}
            {pp?.sobregiroUSD > 0 && <span style={{ color: C_ULTRA.color, fontWeight: 800 }}> — esta compra lo pasa por {fU(pp.sobregiroUSD)}</span>}
          </div>}
        </div>;
      })}
    </div>}

    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <button type="button" onClick={agregar}
        style={{ padding: "7px 14px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 800, border: "1px dashed #CBD5E1", background: "#fff", color: "#475569" }}>
        + Agregar ítem de {multi ? `${solEf} · ${cat}` : cat}
      </button>
      {ev.suma > 0 && <span style={{ marginLeft: "auto", fontSize: 12.5, color: "#475569" }}>Suma de ítems: <b style={{ color: "#0f172a" }}>{fL(ev.suma)}</b></span>}
    </div>
    {ev.suma > 0 && num(montoTotal) > 0 && Math.abs(dif) > 0.5 && (dif > 0
      ? <div style={{ fontSize: 11.5, color: "#64748b", lineHeight: 1.45 }}>La diferencia con el monto total ({fL(dif)} — ISV, flete…) se reparte proporcional entre los ítems.</div>
      : <div style={{ fontSize: 11.5, color: C_AMARILLO.color, background: C_AMARILLO.bg, borderRadius: 8, padding: "7px 10px", fontWeight: 700 }}>Los ítems suman {fL(-dif)} más que el monto total — revisá.</div>)}
  </div>;
}

// ── GeoCost: "Dividir en ítems" una compra que ya existe ──────────────────
// Para las solicitudes que se cargaron antes (o sin ítems) y mezclan cosas de
// varias partidas — la 0422 de Torre Adobe. Solo reparte el COSTO: no toca el
// pago, el estado ni la descripción de la compra. El guardado lo hace GeoCost
// (getCloud → map por id → set → verify) con el audit `partida_reclasificada`,
// el mismo que `sP` de GeoShopping rescata si otra pestaña guarda encima.
export function DividirItemsModal({ purchase, pres, tasa, disponibleDe, onSave, onClose, Modal, Textarea, Btn }) {
  const [lineas, setLineas] = useState(() => lineasIniciales(purchase));
  const [justif, setJustif] = useState(purchase?.sobregiroJustificacion || "");
  const [saving, setSaving] = useState(false);
  const ev = evaluarLineas({ pres, lineas, montoTotal: purchase?.amount, tasa, disponibleDe });
  const guardar = async () => {
    const e = errorLineas(ev, { justificacion: justif, montoTotal: purchase?.amount });
    if (e) { alert(e + "."); return; }
    setSaving(true);
    try {
      const ok = await onSave({ lineas: lineasParaGuardar(pres, lineas), partidaId: ev.principal, sobregiroJustificacion: ev.sobregiroUSD > 0 ? String(justif).trim() : "" });
      if (ok) onClose();
    } finally { setSaving(false); }
  };
  return <Modal title={`Dividir en ítems — ${purchase?.codigo || ""}`} onClose={onClose} wide fondoCierra={false}>
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{purchase?.provider}</div>
          <div style={{ fontSize: 12, color: "#6E6862", whiteSpace: "pre-line", marginTop: 4, lineHeight: 1.45 }}>{purchase?.description}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10.5, color: "#6E6862", fontWeight: 700, textTransform: "uppercase", letterSpacing: .4 }}>Monto pagado</div>
          <div style={{ font: "800 17px/1.2 var(--display)", whiteSpace: "nowrap" }}>{fL(purchase?.amount)}</div>
        </div>
      </div>
      <LineasPresupuesto pres={pres} lineas={lineas} onChange={setLineas} montoTotal={purchase?.amount} tasa={tasa} disponibleDe={disponibleDe} isMobile={typeof window !== "undefined" && window.innerWidth < 640} />
      {ev.sobregiroUSD > 0 && <div style={{ background: C_ULTRA.bg, border: `1px solid ${C_ULTRA.borde}`, borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: C_ULTRA.color }}>Sobrepasa el presupuesto en {fU(ev.sobregiroUSD)}</div>
        <Textarea label="Justificación del sobregiro *" value={justif} onChange={e => setJustif(e.target.value)} placeholder="Por qué se carga igual" />
      </div>}
      <div style={{ fontSize: 11.5, color: "#6E6862", lineHeight: 1.5 }}>Solo cambia a qué partidas se carga el costo. El pago, el estado y la descripción de la compra quedan igual.</div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Btn>
        <Btn onClick={guardar} disabled={saving}>{saving ? "Guardando…" : "Guardar ítems"}</Btn>
      </div>
    </div>
  </Modal>;
}
