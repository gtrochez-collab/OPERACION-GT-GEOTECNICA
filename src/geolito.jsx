// Geolito el técnico (28-oct-2026, pedido de Gerson): el ayudante de GeoSupply.
// Un circulito abajo a la derecha que abre un chat de preguntas frecuentes —
// "como esas páginas que te enseñan un circulito". NO usa ningún servicio
// externo ni IA: las respuestas están escritas acá y toman los días y horas
// de la Configuración del módulo, así nunca dicen otra cosa que el sistema.
// La imagen es `public/brand/geolito.png`; si no está, sale el dibujo SVG.
import { useEffect, useRef, useState } from "react";
import { DIAS_SEMANA, configEfectiva } from "./geosupply-calc.js";

const BASE = import.meta.env.BASE_URL || "/";
const ORANGE = "#E8762D";
const CHARCOAL = "#2C2A28";

const hora12 = (hhmm) => {
  const [h, m] = String(hhmm || "12:00").split(":").map(Number);
  if (h === 12 && !m) return "12:00 del mediodía";
  const ap = h < 12 ? "a. m." : "p. m.";
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${ap}`;
};

// Dibujo de respaldo: Geolito con su casco blanco "G" y chaleco naranja.
function GeolitoSVG({ size = 56 }) {
  return <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
    <circle cx="50" cy="50" r="50" fill="#FFF4EB" />
    <path d="M18 100 Q20 78 50 76 Q80 78 82 100 Z" fill={ORANGE} />
    <path d="M44 77 L50 92 L56 77" fill="#5A5A5A" />
    <rect x="22" y="90" width="56" height="4" fill="#D9D4CC" />
    <ellipse cx="50" cy="56" rx="25" ry="23" fill="#7A4A2A" stroke={CHARCOAL} strokeWidth="2" />
    <ellipse cx="54" cy="64" rx="15" ry="11" fill="#D9A274" />
    <ellipse cx="40" cy="58" rx="4.5" ry="5.5" fill="#fff" stroke={CHARCOAL} strokeWidth="1.2" /><circle cx="41" cy="59" r="2.4" fill={CHARCOAL} />
    <ellipse cx="58" cy="56" rx="4.5" ry="5.5" fill="#fff" stroke={CHARCOAL} strokeWidth="1.2" /><circle cx="59" cy="57" r="2.4" fill={CHARCOAL} />
    <ellipse cx="48" cy="64" rx="5" ry="3.6" fill="#3B2418" />
    <path d="M48 69 Q55 76 63 68" fill="#E08A7A" stroke={CHARCOAL} strokeWidth="1.6" strokeLinecap="round" />
    <path d="M24 44 Q26 20 50 19 Q74 20 76 44 Z" fill="#fff" stroke={CHARCOAL} strokeWidth="2" />
    <rect x="20" y="42" width="60" height="6" rx="3" fill="#fff" stroke={CHARCOAL} strokeWidth="2" />
    <text x="50" y="39" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="15" fill={ORANGE}>G</text>
  </svg>;
}

function Avatar({ size }) {
  const [sinFoto, setSinFoto] = useState(false);
  if (sinFoto) return <GeolitoSVG size={size} />;
  return <img src={`${BASE}brand/geolito.png`} alt="" onError={() => setSinFoto(true)}
    style={{ width: size, height: size, objectFit: "cover", objectPosition: "50% 8%", borderRadius: "50%", background: "#FFF4EB", display: "block" }} />;
}

const preguntasDe = (cfgIn) => {
  const c = configEfectiva(cfgIn).cortes;
  const cierre = `${DIAS_SEMANA[c.cierreSolicitudes.dia]} a las ${hora12(c.cierreSolicitudes.hora)}`;
  const almacen = `${DIAS_SEMANA[c.almacenHasta.dia]} a las ${hora12(c.almacenHasta.hora)}`;
  const aprob = `${DIAS_SEMANA[c.aprobacionHasta.dia]} a las ${hora12(c.aprobacionHasta.hora)}`;
  const llegada = `entre el ${DIAS_SEMANA[c.llegadaDesde]} y el ${DIAS_SEMANA[c.llegadaHasta]} de la semana siguiente`;
  return [
    {
      id: "proceso",
      q: "¿Cómo funciona el proceso?",
      a: [
        "¡Con gusto te explico! Es como pedir un paquete: vos lo pedís y el sistema te va diciendo dónde va.",
        "1. Pedís el material. Entrás a GeoSupply, tocás \"+ Nueva solicitud\", elegís el proyecto y le das a los materiales de la receta (lo que el PM presupuestó para tu proyecto). Si algo no está en la receta, lo podés agregar explicando para qué es.",
        `2. Todo se junta en un \"corte\" cada semana. El corte cierra el ${cierre}. Lo que enviés antes de esa hora entra al corte de esa semana.`,
        `3. Almacén revisa primero. Hasta el ${almacen}, Óscar ve si ya tenemos tu material en bodega. Si hay, te lo despacha de ahí y no se compra.`,
        "4. Lo que no hay, se cotiza. Compras (Ana) busca precios con los proveedores.",
        `5. El Lic. Gerson aprueba. Revisa que el precio cuadre con el presupuesto y aprueba la compra, a más tardar el ${aprob}.`,
        `6. Se paga y te llega. Finanzas lo manda a pagar, la Lic. Carolina paga y Logística lo lleva a tu proyecto. Llega ${llegada}.`,
        "Un detalle: si pedís algo fuera de la receta, más de lo que queda en la receta o lo marcás urgente, primero lo revisa el Lic. Gerson antes de seguir.",
        "En \"Solicitudes\" tocás cualquiera y ves en qué paso va cada material, hasta que te llega con la ficha firmada.",
      ],
    },
    {
      id: "tarde",
      q: "¿Qué pasa si envío una solicitud fuera de tiempo y la necesito?",
      a: [
        `Si la enviás después del ${cierre}, el sistema la pasa solita al siguiente corte. O sea, te llega una semana después.`,
        "Si de verdad la necesitás antes, hablá con el Lic. Gerson para que él haga el ajuste.",
        "Pero ojo: esto no debería pasar. Planificá lo que vas a necesitar y enviá tu solicitud a tiempo. Cada solicitud que se manda tarde queda registrada y probablemente tenga consecuencias en tu evaluación de cumplimiento.",
      ],
    },
  ];
};

export default function Geolito({ cfg, nombre = "" }) {
  const [abierto, setAbierto] = useState(false);
  const [chat, setChat] = useState([]);          // [{de: "geolito"|"yo", t}]
  const [escribiendo, setEscribiendo] = useState(false);
  const finRef = useRef(null);
  const timers = useRef([]);
  const preguntas = preguntasDe(cfg);
  const primerNombre = String(nombre || "").replace(/^(Lic\.|Ing\.|Dr\.|Arq\.)\s*/i, "").split(" ")[0];

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => { finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [chat, escribiendo]);
  useEffect(() => {
    if (!abierto) return;
    const esc = (e) => { if (e.key === "Escape") setAbierto(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [abierto]);

  const preguntar = (p) => {
    if (escribiendo) return;
    setChat(c => [...c, { de: "yo", t: p.q }]);
    setEscribiendo(true);
    // Las respuestas salen una burbuja a la vez, como un chat de verdad.
    p.a.forEach((t, i) => {
      timers.current.push(setTimeout(() => {
        setChat(c => [...c, { de: "geolito", t }]);
        if (i === p.a.length - 1) setEscribiendo(false);
      }, 450 + i * 650));
    });
  };

  const burbuja = (m, i) => <div key={i} style={{ display: "flex", justifyContent: m.de === "yo" ? "flex-end" : "flex-start" }}>
    <div style={{ maxWidth: "85%", padding: "9px 13px", borderRadius: 16, borderBottomRightRadius: m.de === "yo" ? 4 : 16, borderBottomLeftRadius: m.de === "yo" ? 16 : 4, background: m.de === "yo" ? ORANGE : "rgba(44,42,40,.06)", color: m.de === "yo" ? "#fff" : CHARCOAL, fontSize: 13.5, lineHeight: 1.45, whiteSpace: "pre-line" }}>{m.t}</div>
  </div>;

  return <>
    {abierto && <div role="dialog" aria-label="Geolito el técnico" style={{ position: "fixed", right: 20, bottom: 96, zIndex: 900, width: "min(380px, calc(100vw - 32px))", height: "min(560px, calc(100vh - 140px))", display: "flex", flexDirection: "column", borderRadius: 22, background: "#fff", boxShadow: "0 24px 60px rgba(44,42,40,.22), 0 0 0 1px rgba(44,42,40,.06)", overflow: "hidden", animation: "geolitoEntra .32s cubic-bezier(.32,.72,0,1)" }}>
      <style>{"@keyframes geolitoEntra{from{opacity:0;transform:translateY(14px) scale(.97)}}@media (prefers-reduced-motion: reduce){[role=dialog]{animation:none!important}}"}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: "1px solid rgba(44,42,40,.08)" }}>
        <Avatar size={44} />
        <div style={{ flex: 1 }}>
          <div style={{ font: "800 15px/1.1 var(--display, inherit)", color: CHARCOAL }}>Geolito</div>
          <div style={{ fontSize: 11.5, color: "var(--text-3, #8A857E)", marginTop: 3 }}>el técnico · te ayuda con GeoSupply</div>
        </div>
        <button onClick={() => setAbierto(false)} aria-label="Cerrar" style={{ width: 32, height: 32, borderRadius: 999, border: "none", background: "rgba(44,42,40,.06)", color: CHARCOAL, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        {burbuja({ de: "geolito", t: `¡Hola${primerNombre ? `, ${primerNombre}` : ""}! Soy Geolito, el técnico. ¿En qué te ayudo?` }, "hola")}
        {chat.map(burbuja)}
        {escribiendo && <div style={{ display: "flex" }}><div style={{ padding: "9px 14px", borderRadius: 16, borderBottomLeftRadius: 4, background: "rgba(44,42,40,.06)", color: "var(--text-3, #8A857E)", fontSize: 13 }}>Escribiendo…</div></div>}
        <div ref={finRef} />
      </div>
      <div style={{ padding: "10px 14px 14px", borderTop: "1px solid rgba(44,42,40,.08)", display: "flex", flexDirection: "column", gap: 6 }}>
        {preguntas.map(p => <button key={p.id} disabled={escribiendo} onClick={() => preguntar(p)} style={{ textAlign: "left", padding: "9px 13px", borderRadius: 14, border: `1px solid rgba(232,118,45,.35)`, background: "rgba(232,118,45,.06)", color: "#A94E16", fontSize: 13, fontWeight: 700, cursor: escribiendo ? "default" : "pointer", fontFamily: "inherit", opacity: escribiendo ? .55 : 1 }}>{p.q}</button>)}
      </div>
    </div>}
    <button onClick={() => setAbierto(a => !a)} aria-label={abierto ? "Cerrar a Geolito" : "Preguntale a Geolito cómo funciona"} title="Preguntale a Geolito"
      style={{ position: "fixed", right: 20, bottom: 20, zIndex: 900, width: 64, height: 64, padding: 0, borderRadius: "50%", border: `3px solid ${ORANGE}`, background: "#fff", boxShadow: "0 10px 28px rgba(44,42,40,.25)", cursor: "pointer", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {abierto ? <span style={{ fontSize: 22, color: CHARCOAL }}>✕</span> : <Avatar size={58} />}
    </button>
  </>;
}
