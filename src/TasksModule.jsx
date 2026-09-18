// ═══════════════════════════════════════════════════════════════════════════
// GeoTasks — Mis tareas (18-sep-2026, pedido de Gerson)
// ═══════════════════════════════════════════════════════════════════════════
// "Quiero que si le das click [a la tarjeta TO-DOS] entrés a otra página donde
//  estén todos tus to-dos; que sea una herramienta para que todos los
//  colaboradores podamos organizar nuestras tareas CON FECHA y todo, para
//  planificarnos mejor."
//
// Misma key que la tarjeta de la bienvenida: `gt-todos-<username>`. Es a
// propósito — los pendientes que ya tenías aparecen acá sin migrar nada, y lo
// que agregás acá se ve allá. Los campos nuevos (`fecha`, `nota`, `doneAt`)
// son ADITIVOS: una tarea vieja sin fecha simplemente cae en "Sin fecha".
//
// Cada usuario tiene SU key: nadie ve ni pisa las tareas de otro.
import { useState, useEffect, useRef } from "react";
import { store } from "./supabase.js";
import { GT_CSS } from "./gt-ui.js";

const ORANGE = "#E8762D";
const ORANGE_DARK = "#C75F1F";
const CHARCOAL = "#2C2A28";
// Misma paleta del resto del sistema (semáforo suave).
const C_GRIS  = { color: "#6E6862", bg: "rgba(44,42,40,.06)" };
const C_VERDE = { color: "#177243", bg: "#DCF3E4" };
const C_AZUL  = { color: "#1D5FAF", bg: "#DDE9FA" };
const C_ROJO  = { color: "#B03024", bg: "rgba(192,57,43,.07)", borde: "rgba(192,57,43,.22)" };
const C_NARANJA = { color: "#A94E16", bg: "rgba(232,118,45,.12)", borde: "rgba(232,118,45,.30)" };

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < breakpoint : false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [breakpoint]);
  return isMobile;
}

// ── Fechas: TODO por string YYYY-MM-DD y partes LOCALES ──
// `new Date("2026-09-18")` es medianoche UTC y en Honduras (UTC-6) devuelve el
// día anterior — el mismo bug que ya corrimos en asistencia y en "vencida".
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hoyYMD = () => ymd(new Date());
const masDias = (base, n) => { const d = new Date(base + "T12:00:00"); d.setDate(d.getDate() + n); return ymd(d); };
// Lunes de la semana de una fecha (la semana laboral acá es lunes→domingo).
const lunesDe = (y) => { const d = new Date(y + "T12:00:00"); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return ymd(d); };
const fmtFechaCorta = (y) => {
  if (!y) return "";
  const [a, m, d] = y.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-HN", { day: "numeric", month: "short" });
};
const fmtFechaLarga = (y) => {
  if (!y) return "Sin fecha";
  const [a, m, d] = y.split("-").map(Number);
  const t = new Date(a, m - 1, d).toLocaleDateString("es-HN", { weekday: "long", day: "numeric", month: "long" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
// Etiqueta relativa: la que de verdad sirve para planificarse.
const relativa = (f) => {
  if (!f) return null;
  const h = hoyYMD();
  if (f === h) return { txt: "Hoy", c: C_NARANJA };
  if (f === masDias(h, 1)) return { txt: "Mañana", c: C_AZUL };
  if (f < h) {
    const dias = Math.round((Date.parse(h + "T00:00:00Z") - Date.parse(f + "T00:00:00Z")) / 86400000);
    return { txt: dias === 1 ? "Atrasada 1 día" : `Atrasada ${dias} días`, c: C_ROJO, atrasada: true };
  }
  return { txt: fmtFechaCorta(f), c: C_GRIS };
};

const uid = () => Math.random().toString(36).slice(2, 10);

// ═══════════════════════════════════════════════════════════════════════════
export default function TasksModule({ userRole, userName, userKey, onBack, onLogout }) {
  const isMobile = useIsMobile();
  const key = `gt-todos-${userKey}`;

  const [tareas, _setTareasRaw] = useState(null);   // null = cargando
  const tareasRef = useRef([]);
  const setTareas = (v) => { tareasRef.current = v; _setTareasRaw(v); };
  const [guardando, setGuardando] = useState(false);
  const [vista, setVista] = useState("pendientes");  // pendientes | hoy | semana | hechas
  const [nuevo, setNuevo] = useState("");
  const [nuevaFecha, setNuevaFecha] = useState(hoyYMD());
  const [editando, setEditando] = useState(null);    // id de la tarea en edición

  useEffect(() => {
    let vivo = true;
    (async () => {
      try { const t = await store.get(key); if (vivo) setTareas(Array.isArray(t) ? t : []); }
      catch { if (vivo) setTareas([]); }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Guardado (getCloud + rescate + verify) ──────────────────────────────
  // La lista es personal, pero la misma persona puede tenerla abierta en la
  // compu y en el teléfono. Reglas de siempre: si la nube no responde NO se
  // guarda (y se revierte la pantalla), lo que el otro dispositivo agregó y
  // yo nunca tuve se rescata, y al final se verifica releyendo la nube.
  const guardar = async (next) => {
    const previa = tareasRef.current || [];
    setTareas(next);
    setGuardando(true);
    try {
      let nube;
      try { nube = await store.getCloud(key); }
      catch {
        setTareas(previa);
        alert("⚠️ No hay conexión con la nube.\n\nNo se guardó el cambio. Esperá unos segundos y volvé a intentar.");
        return false;
      }
      const nubeArr = Array.isArray(nube) ? nube : [];
      const mios = new Set(next.map(t => t.id));
      const previos = new Set(previa.map(t => t.id));
      // Lo que está en la nube, yo no tengo ahora y TAMPOCO tenía antes = lo
      // agregó mi otro dispositivo. Lo que sí tenía antes y ya no, lo borré yo.
      const ajenas = nubeArr.filter(t => t && t.id && !mios.has(t.id) && !previos.has(t.id));
      const merged = [...next, ...ajenas];
      const ok = await store.set(key, merged);
      if (!ok) {
        setTareas(previa);
        alert("⚠️ No se pudo guardar. Volvé a intentar.");
        return false;
      }
      try {
        const verify = await store.getCloud(key);
        if (Array.isArray(verify)) {
          const enNube = new Set(verify.map(t => t?.id));
          const faltan = next.filter(t => !enNube.has(t.id));
          if (faltan.length) {
            alert(`⚠️ ${faltan.length} tarea(s) no quedaron guardadas en la nube. Recargá la página y revisá.`);
            return false;
          }
        }
      } catch { /* el verify es best-effort: el set ya confirmó */ }
      setTareas(merged);
      return true;
    } finally { setGuardando(false); }
  };

  const agregar = () => {
    if (tareas === null) return;               // con la lista cargando, un set pisaría la nube
    const t = nuevo.trim();
    if (!t) return;
    guardar([...tareas, { id: uid(), txt: t, done: false, fecha: nuevaFecha || "", at: new Date().toISOString() }]);
    setNuevo("");
  };
  const toggle = (id) => guardar(tareas.map(t => t.id === id
    ? { ...t, done: !t.done, doneAt: !t.done ? new Date().toISOString() : null }
    : t));
  const quitar = (id) => guardar(tareas.filter(t => t.id !== id));
  const parchar = (id, patch) => guardar(tareas.map(t => t.id === id ? { ...t, ...patch } : t));

  // ── Clasificación ──
  const h = hoyYMD();
  const finSemana = masDias(lunesDe(h), 6);
  const lista = tareas || [];
  const pendientes = lista.filter(t => !t.done);
  const hechas = lista.filter(t => t.done);
  const deHoy = pendientes.filter(t => t.fecha && t.fecha <= h);          // incluye atrasadas
  const atrasadas = pendientes.filter(t => t.fecha && t.fecha < h);
  const deSemana = pendientes.filter(t => t.fecha && t.fecha <= finSemana);
  const sinFecha = pendientes.filter(t => !t.fecha);

  const VISTAS = [
    { k: "pendientes", label: "Todas", n: pendientes.length },
    { k: "hoy", label: "Hoy", n: deHoy.length },
    { k: "semana", label: "Esta semana", n: deSemana.length },
    { k: "hechas", label: "Hechas", n: hechas.length },
  ];
  const visibles = vista === "hoy" ? deHoy
    : vista === "semana" ? deSemana
      : vista === "hechas" ? hechas
        : pendientes;

  // Agrupadas por fecha: las que tienen día primero (más cercano arriba) y
  // "Sin fecha" al final — es el orden en que uno planifica.
  const grupos = (() => {
    const m = {};
    visibles.forEach(t => { const k2 = t.fecha || "—"; (m[k2] = m[k2] || []).push(t); });
    const keys = Object.keys(m).sort((a, b) => {
      if (a === "—") return 1;
      if (b === "—") return -1;
      return vista === "hechas" ? b.localeCompare(a) : a.localeCompare(b);
    });
    return keys.map(k2 => ({ fecha: k2, items: m[k2] }));
  })();

  // ── UI ──
  const pill = (txt, activo, onClick, n) => (
    <button key={txt} onClick={onClick} aria-pressed={activo} style={{
      padding: "6px 14px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
      border: activo ? "1px solid transparent" : "1px solid var(--hairline)",
      background: activo ? ORANGE_DARK : "var(--surface)", color: activo ? "#fff" : "var(--text-2)",
      fontSize: 12.5, fontWeight: 800, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 7,
    }}>
      {txt}
      {n != null && <span style={{ fontSize: 11, opacity: activo ? .85 : .6, fontVariantNumeric: "tabular-nums" }}>{n}</span>}
    </button>
  );

  const fila = (t) => {
    const rel = relativa(t.fecha);
    const enEdicion = editando === t.id;
    return <div key={t.id} className="gt-vidrio" style={{
      padding: isMobile ? "12px 14px" : "12px 18px",
      display: "grid", gridTemplateColumns: "22px minmax(0,1fr) auto", alignItems: "center", gap: 14,
      background: rel?.atrasada && !t.done ? C_ROJO.bg : undefined,
      borderColor: rel?.atrasada && !t.done ? C_ROJO.borde : undefined,
    }}>
      <input type="checkbox" checked={!!t.done} onChange={() => toggle(t.id)} aria-label={t.done ? `Marcar "${t.txt}" como pendiente` : `Marcar "${t.txt}" como hecha`}
        style={{ width: 18, height: 18, cursor: "pointer", accentColor: ORANGE_DARK }} />

      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
        {enEdicion ? (
          <input autoFocus defaultValue={t.txt}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== t.txt) parchar(t.id, { txt: v }); setEditando(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditando(null); }}
            style={{ padding: "6px 10px", border: `1px solid ${ORANGE}`, borderRadius: 9, fontSize: 14, fontFamily: "inherit", outline: "none", background: "var(--surface)", width: "100%", boxSizing: "border-box" }} />
        ) : (
          <div onClick={() => !t.done && setEditando(t.id)} title={t.done ? "" : "Click para editar"}
            style={{ fontSize: 14.5, lineHeight: 1.35, color: t.done ? "var(--text-faint)" : "var(--text)", textDecoration: t.done ? "line-through" : "none", wordBreak: "break-word", cursor: t.done ? "default" : "text" }}>
            {t.txt}
          </div>
        )}
        {rel && !t.done && <span style={{ alignSelf: "flex-start", padding: "2px 9px", borderRadius: 999, fontSize: 10.5, fontWeight: 800, color: rel.c.color, background: rel.c.bg, whiteSpace: "nowrap" }}>{rel.txt}</span>}
        {t.done && t.doneAt && <span style={{ fontSize: 10.5, color: "var(--text-faint)" }}>Hecha el {fmtFechaCorta(String(t.doneAt).slice(0, 10))}</span>}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {/* La fecha se cambia acá mismo: un date nativo, sin modales */}
        <input type="date" value={t.fecha || ""} onChange={(e) => parchar(t.id, { fecha: e.target.value })}
          aria-label={`Fecha de "${t.txt}"`} title="Fecha para hacerla"
          style={{ padding: "5px 8px", border: "1px solid var(--hairline)", borderRadius: 9, fontSize: 11.5, fontFamily: "inherit", background: "var(--surface)", color: "var(--text-2)", colorScheme: "light" }} />
        <button onClick={() => quitar(t.id)} title="Quitar" aria-label={`Quitar "${t.txt}"`}
          style={{ width: 30, height: 30, borderRadius: 9, border: "1px solid var(--hairline)", background: "var(--surface)", color: "var(--text-3)", fontSize: 13, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
      </div>
    </div>;
  };

  const logoUrl = `${import.meta.env.BASE_URL}brand/logo-color.png`;

  return <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", fontFamily: "inherit", background: "#F9F9F8", color: CHARCOAL }}>
    <style>{GT_CSS}</style>
    {/* Sin las manchas el backdrop-filter del vidrio no difumina nada */}
    <div className="gt-brillo gt-brillo-a" aria-hidden />
    <div className="gt-brillo gt-brillo-b" aria-hidden />

    {/* HEADER — mismo patrón que el resto de los módulos */}
    <div style={{ position: "relative", zIndex: 2, flexShrink: 0, borderBottom: "1px solid rgba(44,42,40,.08)", padding: isMobile ? "10px 12px" : "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12, minWidth: 0 }}>
        {onBack && <button className="gt-circulo" onClick={onBack} title="Volver al panel" aria-label="Volver al panel" style={{ width: 40, height: 40, fontSize: 17 }}>←</button>}
        <img src={logoUrl} alt="Geotecnica Soluciones" style={{ height: isMobile ? 28 : 34, width: "auto", display: "block" }} />
        <div title="Mis tareas" aria-label="Mis tareas" style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(232,118,45,.12)", color: "var(--naranja-tinta)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 11l3 3 8-8" /><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />
          </svg>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        {guardando && <span style={{ fontSize: 11.5, color: "var(--naranja-tinta)", fontWeight: 700 }}>Guardando…</span>}
        {!isMobile && <div style={{ textAlign: "right" }}>
          <div style={{ font: "600 13px/1.3 var(--sans)", color: "var(--text)" }}>{userName || "Usuario"}</div>
          <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 2 }}>Mis tareas</div>
        </div>}
        {onLogout && <button onClick={onLogout} title="Cerrar sesión" style={{ minHeight: 36, padding: "8px 14px", borderRadius: 999, border: "1px solid rgba(192,57,43,.25)", background: "rgba(192,57,43,.06)", color: "#B03024", font: "700 12px/1 var(--sans)", cursor: "pointer" }}>Cerrar sesión</button>}
      </div>
    </div>

    <div style={{ position: "relative", zIndex: 1, flex: 1, overflow: "auto" }}>
      <div style={{ maxWidth: 940, margin: "0 auto", padding: isMobile ? "16px 14px 40px" : "22px 32px 48px", display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 14 }}>

        {/* Resumen */}
        <div className="gt-vidrio" style={{ padding: "11px 20px", display: "flex", alignItems: "center", gap: isMobile ? 12 : 0, flexWrap: "wrap" }}>
          {[
            { v: deHoy.length, l: "para hoy", c: deHoy.length ? "var(--naranja-tinta)" : undefined },
            { v: atrasadas.length, l: "atrasadas", c: atrasadas.length ? C_ROJO.color : undefined },
            { v: deSemana.length, l: "esta semana" },
            { v: sinFecha.length, l: "sin fecha" },
            { v: hechas.length, l: "hechas", c: hechas.length ? C_VERDE.color : undefined },
          ].map((x, i, arr) => (
            <div key={x.l} style={{ display: "flex", alignItems: "center", flex: isMobile ? "1 1 30%" : 1, minWidth: 0 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ font: "800 clamp(15px,1.3vw,19px)/1.15 var(--display)", letterSpacing: "-.01em", color: x.c || "var(--text)", whiteSpace: "nowrap" }}>{tareas === null ? "—" : x.v}</div>
                <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 2, fontSize: 9 }}>{x.l}</div>
              </div>
              {!isMobile && i < arr.length - 1 && <div style={{ width: 1, alignSelf: "stretch", background: "var(--hairline)", margin: "0 18px 0 auto" }} />}
            </div>
          ))}
        </div>

        {/* Agregar */}
        <div className="gt-vidrio" style={{ padding: isMobile ? "12px 14px" : "14px 18px", display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
          <input
            placeholder={tareas === null ? "Cargando tus tareas…" : "¿Qué tenés que hacer?"}
            value={nuevo} disabled={tareas === null}
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") agregar(); }}
            style={{ flex: "1 1 240px", minWidth: 0, padding: "10px 14px", border: "1px solid var(--hairline)", borderRadius: 12, fontSize: 14, fontFamily: "inherit", outline: "none", background: "var(--surface)", color: "var(--text)" }} />
          <input type="date" value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} title="¿Para cuándo?"
            style={{ padding: "10px 12px", border: "1px solid var(--hairline)", borderRadius: 12, fontSize: 13, fontFamily: "inherit", background: "var(--surface)", color: "var(--text-2)", colorScheme: "light" }} />
          <button onClick={agregar} disabled={tareas === null || !nuevo.trim()}
            style={{ padding: "10px 22px", borderRadius: 999, border: "none", background: nuevo.trim() ? ORANGE : "rgba(44,42,40,.08)", color: nuevo.trim() ? "#fff" : "var(--text-faint)", font: "800 13.5px/1 var(--sans)", cursor: nuevo.trim() ? "pointer" : "default", boxShadow: nuevo.trim() ? "0 4px 14px rgba(232,118,45,.28)" : "none", whiteSpace: "nowrap" }}>
            Agregar
          </button>
        </div>

        {/* Vistas */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {VISTAS.map(v => pill(v.label, vista === v.k, () => setVista(v.k), v.n))}
          {vista === "hechas" && hechas.length > 0 && (
            <button onClick={() => { if (confirm(`¿Borrar las ${hechas.length} tareas que ya hiciste?`)) guardar(lista.filter(t => !t.done)); }}
              style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 999, border: "1px solid var(--hairline)", background: "var(--surface)", color: "var(--text-3)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Limpiar hechas
            </button>
          )}
        </div>

        {/* Lista */}
        {tareas === null
          ? <div className="gt-vidrio" style={{ padding: "38px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 13.5 }}>Cargando tus tareas…</div>
          : visibles.length === 0
            ? <div className="gt-vidrio" style={{ padding: "44px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 14 }}>
                {vista === "hechas" ? "Todavía no marcaste ninguna como hecha."
                  : vista === "hoy" ? "Nada para hoy — día redondo."
                    : vista === "semana" ? "Nada agendado para esta semana."
                      : "Nada pendiente. Agregá tu primera tarea arriba."}
              </div>
            : grupos.map(g => (
              <div key={g.fecha} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                  <span className="gt-label" style={{ color: g.fecha !== "—" && g.fecha < h && vista !== "hechas" ? C_ROJO.color : "var(--text-2)", fontSize: 10.5 }}>
                    {g.fecha === "—" ? "Sin fecha" : fmtFechaLarga(g.fecha)}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-3)" }}>{g.items.length}</span>
                </div>
                {g.items.map(fila)}
              </div>
            ))}
      </div>
    </div>
  </div>;
}
