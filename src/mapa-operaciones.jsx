// ─────────────────────────────────────────────────────────────────────────────
// "¿Dónde vas a trabajar hoy?" (9-nov-2026, pedido de Gerson — inspirado en
// el mapa que armó para el sistema del IST): después del login, quien tiene
// más de una operación ve Centroamérica; toca un país y el mapa se acerca;
// toca la sede y sale la tarjeta con la foto y "Entrar a esta operación".
// Recién ahí viene la bienvenida de siempre.
//
// Geometría en mapa-centroamerica.js (Natural Earth 50m). Los pines y las
// etiquetas van en HTML sobre el SVG (nítidos) y se acomodan con el MISMO
// viewBox, así acompañan la animación. Paleta GeoCore: blanco, gris, naranja
// y carbón — nada de azules.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from "react";
import { MAPA_W, MAPA_H, PAISES, proyectar } from "./mapa-centroamerica.js";
import { OPERACIONES, OPERACION_ACTUAL } from "./operacion.js";
import { store } from "./supabase.js";
import { GeoCoreMark } from "./Logo.jsx";
import { prefiereMenosMovimiento } from "./geocost-ui.jsx";

const CSS = `
.op-root{min-height:100dvh;display:flex;flex-direction:column;position:relative;overflow:hidden}
.op-header{position:relative;z-index:2;display:flex;justify-content:space-between;align-items:center;gap:16px;padding:14px 24px}
.op-wrap{position:relative;z-index:1;width:100%;max-width:1180px;margin:0 auto;padding:clamp(8px,2.5vh,28px) 24px 28px;box-sizing:border-box;flex:1;display:flex;flex-direction:column}
.op-titulo{font:800 clamp(34px,5.2vw,62px)/1.02 var(--display);letter-spacing:-.03em;color:var(--text);margin:0}
.op-titulo span{color:var(--marca-2)}
.op-sub{display:flex;align-items:center;gap:10px;margin-top:12px;min-height:34px;flex-wrap:wrap}
.op-pill{display:inline-flex;align-items:center;gap:8px;padding:7px 14px;border-radius:999px;border:1px solid var(--v-borde);background:rgba(255,255,255,.72);color:var(--text-2);font:600 13px/1 var(--sans);cursor:pointer;transition:background .2s var(--curva),color .2s var(--curva)}
.op-pill:hover{background:#fff;color:var(--text)}
.op-mapa{position:relative;margin-top:clamp(12px,2.4vh,26px);border-radius:28px;background:linear-gradient(160deg,#F1F2F4 0%,#E7E9ED 100%);box-shadow:var(--e1), inset 0 0 0 1px rgba(44,42,40,.06);overflow:hidden;flex:1;min-height:420px;max-height:calc(100dvh - 250px)}
.op-mapa svg{position:absolute;inset:0;width:100%;height:100%;display:block}
.op-pais{fill:#FBFBFA;stroke:rgba(44,42,40,.18);stroke-width:1.1;vector-effect:non-scaling-stroke;transition:fill .25s var(--curva)}
.op-pais.op-inactivo{fill:#F2F2F1;stroke:rgba(44,42,40,.10)}
.op-pais.op-activo{cursor:pointer;stroke:rgba(44,42,40,.42);fill:#fff}
.op-pais.op-activo:hover,.op-pais.op-hover{fill:rgba(232,118,45,.12)}
.op-pais.op-elegido,.op-pais.op-elegido:hover{fill:#fff;stroke:rgba(44,42,40,.5)}
.op-pais:focus{outline:none}.op-pais:focus-visible{stroke:var(--marca-2);stroke-width:2}
.op-capa{position:absolute;inset:0;pointer-events:none}
.op-rotulo{position:absolute;transform:translate(-50%,-50%);font:600 11px/1 var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--text-3);white-space:nowrap;transition:opacity .3s}
.op-rotulo.op-activo{color:var(--text-2)}
.op-agua{position:absolute;transform:translate(-50%,-50%);font:500 12px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:rgba(44,42,40,.32);white-space:nowrap}
.op-pin{position:absolute;transform:translate(-50%,-50%);pointer-events:auto;display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;background:none;border:0;padding:0;font:inherit}
.op-pin-punto{width:18px;height:18px;border-radius:50%;background:var(--marca-2);box-shadow:0 0 0 5px rgba(232,118,45,.22),0 4px 12px rgba(232,118,45,.4);position:relative;transition:transform .3s var(--curva)}
.op-pin:hover .op-pin-punto,.op-pin.op-elegido .op-pin-punto{transform:scale(1.15)}
.op-pin-punto::after{content:"";position:absolute;inset:-14px;border-radius:50%;border:2px solid rgba(232,118,45,.35);animation:opPulso 2.4s ease-out infinite}
.op-pin-nombre{padding:8px 14px;border-radius:999px;background:#fff;color:var(--text);font:700 14px/1 var(--sans);box-shadow:var(--e1);white-space:nowrap}
.op-pin.op-elegido .op-pin-nombre{background:var(--text);color:#fff}
@keyframes opPulso{from{transform:scale(.6);opacity:1}to{transform:scale(1.6);opacity:0}}
.op-tarjeta{position:absolute;top:24px;right:24px;bottom:24px;width:min(380px,44%);border-radius:24px;background:#fff;box-shadow:var(--e2);display:flex;flex-direction:column;overflow:hidden;animation:opEntra .5s var(--curva) backwards}
@keyframes opEntra{from{opacity:0;transform:translateX(24px)}}
.op-foto{height:150px;flex:none;background:#2C2A28;position:relative;overflow:hidden}
.op-foto img{width:100%;height:100%;object-fit:cover;display:block}
.op-foto-vacia{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:rgba(255,255,255,.72);font:600 12px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;background:radial-gradient(120% 80% at 70% 20%,rgba(232,118,45,.35),transparent 60%),#2C2A28}
.op-cuerpo{padding:16px 20px 18px;display:flex;flex-direction:column;gap:5px;flex:1;min-height:0;overflow:auto}
.op-eyebrow{font:700 11px/1 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--marca-2)}
.op-nombre{font:800 26px/1.05 var(--display);letter-spacing:-.02em;color:var(--text);margin-top:4px}
.op-lugar{font:500 13.5px/1.3 var(--sans);color:var(--text-3)}
.op-dato{display:flex;gap:8px;align-items:baseline;font:500 13.5px/1.35 var(--sans);color:var(--text-2);margin-top:4px}
.op-dato b{color:var(--marca-2);font-weight:800}
.op-acciones{margin-top:auto;padding-top:10px;display:flex;flex-direction:column;gap:8px;align-items:stretch}
.op-entrar{min-height:48px;border-radius:14px;border:0;background:var(--marca-2);color:#fff;font:700 15px/1 var(--sans);cursor:pointer;transition:transform .2s var(--curva),filter .2s}
.op-entrar:hover{filter:brightness(1.05);transform:translateY(-1px)}
.op-link{background:none;border:0;color:var(--text-3);font:600 13px/1 var(--sans);cursor:pointer;padding:8px}
.op-link:hover{color:var(--text)}
.op-norte{position:absolute;top:18px;right:22px;font:600 12px/1 var(--sans);color:var(--text-3);letter-spacing:.06em}
@media (max-width:760px){
  .op-header{padding:12px 16px}.op-wrap{padding:8px 16px 20px}
  .op-mapa{min-height:300px;max-height:none;aspect-ratio:1000/765;flex:none}
  .op-tarjeta{position:relative;inset:auto;width:auto;margin-top:14px;animation-name:opEntraAbajo}
  .op-foto{height:160px}
  @keyframes opEntraAbajo{from{opacity:0;transform:translateY(16px)}}
}
`;

const PAD = 0.10;
const FRAC_IZQ = 0.56;   // el país se centra en este tramo izquierdo; la tarjeta va a la derecha
const VB_TODO = [0, 0, MAPA_W, MAPA_H];
const ease = (t) => 1 - Math.pow(1 - t, 3);
/** viewBox (con la proporción `razon` del contenedor) que deja el bbox
 *  centrado en el tramo IZQUIERDO: la tarjeta de la sede va a la derecha. */
const encuadrar = ([x0, y0, x1, y1], razon, izq = true) => {
  const w0 = x1 - x0, h0 = y1 - y0;
  const frac = izq ? FRAC_IZQ : 1;
  const h = Math.max(h0 * (1 + PAD * 2), (w0 * (1 + PAD * 2)) / (frac * razon));
  const w = h * razon;
  const cx = x0 + w0 / 2, cy = y0 + h0 / 2;
  return [cx - (w * frac) / 2, cy - h / 2, w, h];
};

export default function MapaOperaciones({ user, operaciones, onElegir, onLogout }) {
  const ops = OPERACIONES.filter(o => operaciones.includes(o.id));
  const porPais = useMemo(() => new Map(ops.map(o => [o.paisId, o])), [ops]);
  const [paisId, setPaisId] = useState(null);     // país acercado
  const [sede, setSede] = useState(null);         // {op, sede}
  const [hover, setHover] = useState(null);
  const [vb, setVb] = useState(VB_TODO);
  const animRef = useRef(null);
  // El contenedor no tiene la proporción del viewBox: se AMPLÍA el encuadre
  // (nunca se recorta) para que el SVG y las capas HTML compartan el mismo
  // sistema de coordenadas — así los pines caen exactos.
  const cajaRef = useRef(null);
  const [razon, setRazon] = useState(MAPA_W / MAPA_H);
  useEffect(() => {
    const el = cajaRef.current; if (!el) return;
    const medir = () => { const r = el.getBoundingClientRect(); if (r.width && r.height) setRazon(r.width / r.height); };
    medir();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
    ro?.observe(el); window.addEventListener("resize", medir);
    return () => { ro?.disconnect(); window.removeEventListener("resize", medir); };
  }, []);
  const vbE = useMemo(() => {
    const [x, y, w, h] = vb;
    if (w / h < razon) { const w2 = h * razon; return [x - (w2 - w) / 2, y, w2, h]; }
    const h2 = w / razon; return [x, y - (h2 - h) / 2, w, h2];
  }, [vb, razon]);
  const sinMov = prefiereMenosMovimiento();

  // Conteo de colaboradores activos por operación (lectura directa, best-effort)
  const [cuentas, setCuentas] = useState({});
  useEffect(() => {
    let vivo = true;
    ops.forEach(async (o) => {
      try {
        const e = await store.getCloudDe("hr-emps5", o.id);
        if (vivo) setCuentas(c => ({ ...c, [o.id]: (Array.isArray(e) ? e : []).filter(x => x && x.status !== "inactive").length }));
      } catch { if (vivo) setCuentas(c => ({ ...c, [o.id]: null })); }
    });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animarA = (destino, luego) => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (sinMov) { setVb(destino); luego && luego(); return; }
    const desde = vb, t0 = performance.now(), dur = 720;
    const paso = (t) => {
      const k = ease(Math.min(1, (t - t0) / dur));
      setVb(desde.map((v, i) => v + (destino[i] - v) * k));
      if (k < 1) animRef.current = requestAnimationFrame(paso);
      else { animRef.current = null; luego && luego(); }
    };
    animRef.current = requestAnimationFrame(paso);
  };
  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current); }, []);

  const elegirPais = (p) => {
    const op = porPais.get(p.id);
    if (!op) return;
    setPaisId(p.id);
    setSede(null);
    // Con una sola sede la tarjeta se abre sola al llegar (ahorra un clic).
    animarA(encuadrar(p.bbox, razon, window.innerWidth > 760), () => { if (op.sedes.length === 1) setSede({ op, sede: op.sedes[0] }); });
  };
  const verTodo = () => { setPaisId(null); setSede(null); animarA(VB_TODO); };
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") { if (sede && (porPais.get(paisId)?.sedes.length || 0) > 1) setSede(null); else if (paisId) verTodo(); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  // Posición en % de un punto del viewBox actual (para las capas HTML)
  const pct = ([x, y]) => ({ left: `${((x - vbE[0]) / vbE[2]) * 100}%`, top: `${((y - vbE[1]) / vbE[3]) * 100}%` });
  const dentro = ([x, y]) => x >= vbE[0] + vbE[2] * .03 && x <= vbE[0] + vbE[2] * .97 && y >= vbE[1] + vbE[3] * .04 && y <= vbE[1] + vbE[3] * .96;
  const paisElegido = PAISES.find(p => p.id === paisId) || null;
  const opElegida = paisElegido ? porPais.get(paisElegido.id) : null;
  const zoom = MAPA_W / vb[2];
  const base = import.meta.env.BASE_URL;

  return (
    <div className="gt-ui op-root">
      <style>{CSS}</style>
      <div className="gt-brillo gt-brillo-a" aria-hidden />
      <div className="gt-brillo gt-brillo-b" aria-hidden />
      <header className="op-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <GeoCoreMark size={34} />
          <span style={{ font: "700 15px/1 var(--display)", color: "var(--text)", letterSpacing: "-.01em" }}>GeoCore</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ font: "600 13px/1.3 var(--sans)", color: "var(--text-2)" }}>{user.label}</span>
          <button className="gt-btn" onClick={onLogout} style={{ minHeight: 40 }}>Salir</button>
        </div>
      </header>

      <div className="op-wrap">
        <h1 className="op-titulo gt-sube">¿Dónde vas a<br /><span>trabajar hoy?</span></h1>
        <div className="op-sub">
          {paisElegido ? (
            <>
              <button className="op-pill" onClick={verTodo}>← Toda Centroamérica</button>
              <span style={{ font: "600 13.5px/1 var(--sans)", color: "var(--text-2)" }}>{paisElegido.nombre} · {opElegida?.sedes.length === 1 ? "1 sede" : `${opElegida?.sedes.length || 0} sedes`}</span>
            </>
          ) : (
            <span style={{ font: "500 14px/1.3 var(--sans)", color: "var(--text-3)" }}>Tocá un país para acercarte. Tenés operación en {ops.map(o => o.pais).join(" y ")}.</span>
          )}
        </div>

        <div className="op-mapa" ref={cajaRef}>
          <svg viewBox={vbE.join(" ")} preserveAspectRatio="none" aria-label="Mapa de Centroamérica">
            {PAISES.map(p => {
              const op = porPais.get(p.id);
              const cls = ["op-pais", op ? "op-activo" : "op-inactivo", hover === p.id && op ? "op-hover" : "", paisId === p.id ? "op-elegido" : ""].join(" ");
              return <path key={p.id} d={p.path} className={cls} onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover(null)} onClick={() => elegirPais(p)} role={op ? "button" : undefined} tabIndex={op ? 0 : undefined} onKeyDown={op ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); elegirPais(p); } } : undefined} aria-label={op ? `Entrar a ${p.nombre}` : p.nombre} />;
            })}
          </svg>
          <div className="op-capa">
            {!paisElegido && <>
              <div className="op-agua" style={pct([770, 300])}>Mar Caribe</div>
              <div className="op-agua" style={pct([250, 500])}>Océano Pacífico</div>
            </>}
            {PAISES.filter(p => dentro(p.centro) && (!paisElegido || paisElegido.id !== p.id)).map(p => (
              <div key={p.id} className={`op-rotulo${porPais.get(p.id) ? " op-activo" : ""}`} style={{ ...pct(p.centro), opacity: paisElegido ? 0.5 : 1, fontSize: Math.min(13, 11 * Math.sqrt(zoom)) }}>{p.nombre}</div>
            ))}
            {opElegida && opElegida.sedes.map(s => {
              const on = sede?.sede.id === s.id;
              return <button key={s.id} className={`op-pin${on ? " op-elegido" : ""}`} style={pct(proyectar(s.lon, s.lat))} onClick={() => setSede({ op: opElegida, sede: s })} aria-pressed={on}>
                <span className="op-pin-punto" />
                <span className="op-pin-nombre">{s.nombre}</span>
              </button>;
            })}
          </div>
          {!sede && <div className="op-norte">N ↑</div>}

          {sede && (
            <aside className="op-tarjeta" key={sede.sede.id}>
              <div className="op-foto">
                {sede.sede.foto ? <img src={`${base}${sede.sede.foto}`} alt={sede.sede.nombre} /> : (
                  <div className="op-foto-vacia"><span style={{ display: "inline-flex", transform: "scale(.8)" }}><GeoCoreMark size={40} /></span><span>Foto pendiente</span></div>
                )}
              </div>
              <div className="op-cuerpo">
                <div className="op-eyebrow">Operación · {sede.op.pais}</div>
                <div className="op-nombre">{sede.sede.nombre}</div>
                <div className="op-lugar">{sede.sede.sub}</div>
                <div style={{ height: 8 }} />
                <div className="op-dato"><b>{cuentas[sede.op.id] === undefined ? "…" : cuentas[sede.op.id] === null ? "—" : cuentas[sede.op.id]}</b> colaboradores activos</div>
                <div className="op-dato"><b>{sede.sede.empresas.length}</b> {sede.sede.empresas.length === 1 ? "empresa" : "empresas"} · {sede.sede.empresas.join(" · ")}</div>
                <div className="op-dato"><b>{sede.op.moneda}</b> {sede.op.moneda === "L" ? "lempiras" : "dólares"}</div>
                <div className="op-acciones">
                  <button className="op-entrar" onClick={() => onElegir(sede.op.id)}>Entrar a esta operación</button>
                </div>
              </div>
            </aside>
          )}
        </div>
        <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 12 }}>
          Ahora estás en {OPERACION_ACTUAL.pais}. Cambiar de país recarga la pantalla un instante.
        </div>
      </div>
    </div>
  );
}
