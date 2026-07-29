// =====================================================================
// GEOSAFETY — EPP: catalogo, inventario, proveedores, requisiciones y dotacion
// =====================================================================
// Modelo "Amazon interno": los encargados agregan EPP al carrito y envian
// una requisicion indicando PARA QUE COLABORADOR(ES) va cada item (amarrado
// a hr-emps5 de GeoTeam) y el MOTIVO. Un mismo item puede repartirse entre
// varias personas (ej: 10 guantes → 4 a Juan, 6 a Pedro).
//   - primera_vez : dotacion inicial (sin cargo)
//   - perdida     : perdida/extravio → ALERTA: se deduce en planilla
//   - danio       : dano/desgaste normal (sin cargo)
//
// Pestana DOTACION: ficha visual de cada colaborador (avatar EPP) que mapea
// en tiempo real que equipo TIENE y que le FALTA respecto a la dotacion
// base. Se alimenta de las requisiciones ENTREGADAS (amarrado a la solicitud
// y a quien va asignado). El ideal: todos con su EPP completo.
//
// Storage keys (Supabase via store):
//   - ep-providers : proveedores de EPP
//   - ep-items     : catalogo {nombre, codigo, categoria, tipoEpp, proveedorId, precio, stock, foto, descripcion}
//   - ep-reqs      : requisiciones {numero, solicitante, lineas[], estado}
//   - ep-jornaleros: personal por dia fuera de planilla {id, fullName, position, puesto, notas}
//   - ep-puestos   : override de perfil EPP por persona {personaId: puestoKey}
//   - cp-file-<id> : fotos de items (reutiliza el storage de archivos)
//   Lee (NO escribe): hr-emps5 — empleados de GeoTeam (con sus fotos).
// Las personas de Dotacion = empleados de GeoTeam + jornaleros (company:"jornal").
//
// Flujo requisicion: pendiente → aprobada → entregada (descuenta stock).
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

// Tipos de EPP — mapean a los "slots" del avatar y a los kits por puesto.
const EPP_TIPOS = [
  { value: "casco",                  label: "Casco",                            icon: "⛑️" },
  { value: "lentes",                 label: "Gafas / Lentes",                   icon: "🥽" },
  { value: "camisa",                 label: "Camisa de trabajo",                icon: "👕" },
  { value: "chaleco",                label: "Chaleco",                          icon: "🦺" },
  { value: "pantalon_reflectivo",    label: "Pantalón c/ cinta reflectiva",     icon: "👖" },
  { value: "botas",                  label: "Burros con cubo (botas)",          icon: "🥾" },
  { value: "guantes",                label: "Guantes de uso general",           icon: "🧤" },
  { value: "guantes_mecanica",       label: "Guantes de mecánica",              icon: "🧤" },
  { value: "guantes_soldadura",      label: "Guantes de soldadura",             icon: "🧤" },
  { value: "guantes_carnaza",        label: "Guantes de carnaza",               icon: "🧤" },
  { value: "guantes_latex",          label: "Guantes de látex / nitrilo",       icon: "🧤" },
  { value: "auditiva",               label: "Tapones auditivos",                icon: "👂" },
  { value: "auditiva_orejera",       label: "Orejeras (auditiva)",              icon: "🎧" },
  { value: "cubrenucas",             label: "Cubrenucas / Balaclava",           icon: "🧣" },
  { value: "mascarilla",             label: "Mascarilla desechable KN95",       icon: "😷" },
  { value: "mascarilla_respiratoria",label: "Mascarilla respiratoria",          icon: "😷" },
  { value: "careta_soldar",          label: "Careta electrónica de soldar",     icon: "🛡️" },
  { value: "careta_esmerilar",       label: "Careta de esmerilar",              icon: "🔰" },
  { value: "delantal_soldador",      label: "Delantal de soldador",             icon: "🥼" },
  { value: "polainas_soldador",      label: "Polainas de soldador",             icon: "🦵" },
  { value: "mangas_soldador",        label: "Mangas de soldador",               icon: "💪" },
  { value: "capucha_carnaza",        label: "Monja / Capucha de carnaza",       icon: "🥷" },
  { value: "overol",                 label: "Overol impermeable descartable",   icon: "🧥" },
  { value: "soporte_lumbar",         label: "Soporte lumbar",                   icon: "🎽" },
  { value: "arnes",                  label: "Arnés",                            icon: "🪢" },
  { value: "otro",                   label: "Otro EPP",                         icon: "🧰" },
];
const tipoDef = (v) => EPP_TIPOS.find((t) => t.value === v) || EPP_TIPOS[EPP_TIPOS.length - 1];

// Normalizador para matching de nombres/posiciones (sin acentos, minusculas).
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// NOTA: el codigo de cada producto se digita a mano en su casilla (item.codigo).
// Los items viejos traian el codigo escrito dentro de la descripcion
// ("Codigo: 08130215"); la busqueda tambien mira la descripcion para que esos
// sigan siendo encontrables mientras se les pasa el codigo a su casilla.

// Inferir el tipo de EPP desde el nombre del item — para items/lineas viejas
// que se crearon sin tipo (ej: "Casco" → casco). Asi las entregas viejas
// SI llenan el slot del avatar.
const inferTipo = (nombre) => {
  const n = norm(nombre);
  if (!n) return null;
  if (n.includes("casco")) return "casco";
  if (n.includes("gafa") || n.includes("lente")) return "lentes";
  if (n.includes("careta") && (n.includes("soldar") || n.includes("solda"))) return "careta_soldar";
  if (n.includes("careta") || n.includes("esmeril")) return "careta_esmerilar";
  if (n.includes("guante")) {
    if (n.includes("mecani")) return "guantes_mecanica";
    if (n.includes("soldad")) return "guantes_soldadura";
    if (n.includes("carnaza")) return "guantes_carnaza";
    if (n.includes("latex") || n.includes("nitrilo")) return "guantes_latex";
    return "guantes";
  }
  if (n.includes("chaleco")) return "chaleco";
  if (n.includes("camisa") || n.includes("polo")) return "camisa";
  if (n.includes("pantalon")) return "pantalon_reflectivo";
  if (n.includes("bota") || n.includes("burro")) return "botas";
  if (n.includes("tapon")) return "auditiva";
  if (n.includes("orejera")) return "auditiva_orejera";
  if (n.includes("balaclava") || n.includes("cubrenuca") || n.includes("cubre nuca")) return "cubrenucas";
  if (n.includes("respirator")) return "mascarilla_respiratoria";
  if (n.includes("mascarilla") || n.includes("kn95")) return "mascarilla";
  if (n.includes("delantal")) return "delantal_soldador";
  if (n.includes("polaina")) return "polainas_soldador";
  if (n.includes("manga")) return "mangas_soldador";
  if (n.includes("capucha") || n.includes("monja")) return "capucha_carnaza";
  if (n.includes("overol") || n.includes("overall")) return "overol";
  if (n.includes("lumbar") || n.includes("faja")) return "soporte_lumbar";
  if (n.includes("arnes")) return "arnes";
  return null;
};

// ── PUESTOS: kit de EPP por posicion (segun especificacion de Gerson) ──
// casco = color del casco del puesto; camisa = estilo visual; req = lo que la
// empresa provee y se le debe entregar; camisaDefault = camisa propia (no la
// provee la empresa, se dibuja siempre); jeans van por defecto en TODOS.
const PUESTOS = {
  ingeniero: {
    label: "Ingeniero",
    casco: "#F6F5F2", cascoName: "Casco blanco",
    camisa: "blanca_default", camisaDefault: true,
    req: ["casco", "lentes", "chaleco", "guantes", "auditiva", "cubrenucas"],
    notas: "Camisa y jeans por defecto (no los provee la empresa). El chaleco khaki sí lo puede solicitar. Protección auditiva de tapón + cubrenucas o balaclava.",
  },
  operador_dg: {
    label: "Operador Ø grande",
    casco: "#E8762D", cascoName: "Casco anaranjado",
    camisa: "polo_negra", camisaName: "Polo manga corta negra (líneas anaranjadas)",
    req: ["casco", "camisa", "pantalon_reflectivo", "botas", "lentes", "auditiva", "cubrenucas"],
    notas: "Pantalón con cinta reflectiva: SÍ lo provee la empresa. Protección auditiva de tapón + cubrenucas o balaclava.",
  },
  operador_dp: {
    label: "Operador Ø pequeño",
    casco: "#E8762D", cascoName: "Casco anaranjado",
    camisa: "amarilla", camisaName: "Camisa manga larga amarilla (líneas negras)",
    req: ["casco", "camisa", "pantalon_reflectivo", "botas", "lentes", "guantes", "auditiva", "cubrenucas"],
    notas: "Pantalón con cinta reflectiva: SÍ lo provee la empresa. Protección auditiva de tapón + cubrenucas o balaclava.",
  },
  ayudante: {
    label: "Ayudante / Técnico",
    casco: "#F2C40F", cascoName: "Casco amarillo",
    camisa: "anaranjada", camisaName: "Camisa anaranjada (líneas negras)",
    req: ["casco", "camisa", "botas", "lentes", "guantes", "auditiva", "cubrenucas"],
    notas: "Jeans por defecto (no los provee la empresa). Protección auditiva de tapón + cubrenucas o balaclava.",
  },
  ayudante_concreto: {
    label: "Ayudante Concreto",
    casco: "#F2C40F", cascoName: "Casco amarillo",
    camisa: "anaranjada", camisaName: "Camisa anaranjada (líneas negras)",
    req: ["casco", "camisa", "botas", "lentes", "guantes", "auditiva", "cubrenucas"],
    opcionales: ["guantes_latex", "mascarilla", "overol"],
    notas: "Jeans por defecto. Para trabajos de concreto puede solicitar además: guantes de látex/nitrilo, mascarilla KN95 y overol impermeable descartable.",
  },
  mecanico: {
    label: "Mecánico",
    casco: "#2F6FE0", cascoName: "Casco azul",
    camisa: "anaranjada_rayas", camisaName: "Camisa anaranjada (rayas negras)",
    req: ["casco", "camisa", "guantes_mecanica", "botas", "lentes"],
    notas: "Jeans por defecto. Guantes de mecánica (NO son los de uso general).",
  },
  soldador: {
    label: "Soldador",
    casco: null, camisa: "anaranjada",
    req: ["careta_soldar", "mascarilla_respiratoria", "delantal_soldador", "polainas_soldador", "guantes_soldadura", "mangas_soldador", "capucha_carnaza"],
    notas: "Kit completo de soldadura. Soldadores actuales: Kevin Hernández y Norman (Subterra).",
  },
  tornero: {
    label: "Tornero",
    casco: null, camisa: "anaranjada",
    req: ["guantes_carnaza", "careta_esmerilar", "lentes", "soporte_lumbar", "auditiva_orejera"],
    notas: "Tornero actual: Moisés (Subterra). Protección auditiva de orejera.",
  },
  oficina: {
    label: "Oficina / Admin",
    casco: null, camisa: "blanca_default", camisaDefault: true,
    req: [],
    notas: "Personal administrativo — sin dotación de EPP de campo requerida.",
  },
};
const PUESTO_OPTIONS = Object.entries(PUESTOS).map(([value, p]) => ({ value, label: p.label }));

// Etiqueta de un requisito DENTRO de un kit (casco/camisa con el color/estilo del puesto).
const reqLabel = (puestoKey, tipo) => {
  const P = PUESTOS[puestoKey] || {};
  if (tipo === "casco" && P.cascoName) return P.cascoName;
  if (tipo === "camisa" && P.camisaName) return P.camisaName;
  return tipoDef(tipo).label;
};

// Asignacion automatica de puesto. Los overrides guardados en ep-puestos
// GANAN siempre sobre esto (se cambian desde la ficha de dotacion).
// Listas de operadores DG/DP y especialistas segun tabla de Gerson (jul 2026).
const SEED_PUESTOS = [
  // Operadores de diametro grande (polo negra)
  { match: ["edgar", "izcano"], puesto: "operador_dg" },
  { match: ["kevin", "guiza"], puesto: "operador_dg" },
  { match: ["kevin", "sanchez", "adriano"], puesto: "operador_dg" },
  { match: ["osue", "pineda"], puesto: "operador_dg" },
  { match: ["joel", "maradiaga"], puesto: "operador_dg" },
  // Operadores de diametro pequeno (camisa amarilla)
  { match: ["josue", "izaguirre"], puesto: "operador_dp" },
  { match: ["josue", "manuel", "andino"], puesto: "operador_dp" },
  { match: ["luis", "carlos", "sanchez"], puesto: "operador_dp" },
  { match: ["marvin", "zelaya"], puesto: "operador_dp" },
  { match: ["yeferson", "andino"], puesto: "operador_dp" },
  // Especialistas (Subterra)
  { match: ["kevin", "hernandez"], puesto: "soldador", company: "subterra" },
  { first: "norman", puesto: "soldador", company: "subterra" },
  { first: "moises", puesto: "tornero", company: "subterra" },
];
const autoPuesto = (emp) => {
  const toks = norm(emp.fullName).split(/\s+/).filter(Boolean);
  for (const s of SEED_PUESTOS) {
    if (s.company && emp.company !== s.company) continue;
    if (s.first) { if (toks[0] === s.first) return s.puesto; continue; }
    if (s.match.every((t) => toks.includes(t))) return s.puesto;
  }
  const p = norm(emp.position);
  if (p.includes("ingenier") || p.includes("residente") || p.includes("encargado de proyecto")) return "ingeniero";
  if (p.includes("mecanic")) return "mecanico";
  if (p.includes("soldad")) return "soldador";
  if (p.includes("torner")) return "tornero";
  if (p.includes("asistente") || p.includes("contab") || p.includes("administr") || p.includes("financ") || p.includes("recepcion") || p.includes("gerencia") || p.includes("gerente") || p.includes("compras") || p.includes("conserje")) return "oficina";
  return "ayudante"; // tecnicos, motoristas, operador de grua, etc. — ajustable desde la ficha
};

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
const coTag = (c) => (c === "subterra" ? "SUB" : c === "jornal" ? "JORNAL" : "GEO");

// ── Avatar de empleado (foto o iniciales) ──
const empInitials = (fullName) => {
  if (!fullName) return "?";
  const clean = String(fullName).replace(/^(Lic\.|Ing\.|Sr\.|Sra\.|Dr\.)\s+/i, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
};
const empColor = (name) => {
  const palette = ["#2C5F5D", "#8B3A3A", "#B45309", "#3E6A99", "#7B5FA8", "#5A8A4F", "#C75F1F", "#0F4C75"];
  let h = 0; for (const c of String(name || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
};
const EmpAvatar = ({ name, dataUrl, size = 90, borderRadius = "50%", style: sx }) => {
  const st = { width: size, height: size, borderRadius, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", ...(sx || {}) };
  if (dataUrl) return <div style={{ ...st, background: "#F1F5F9" }}><img src={dataUrl} alt={name || ""} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /></div>;
  return <div style={{ ...st, background: empColor(name), color: "#fff", fontWeight: 700, fontSize: size * 0.36, letterSpacing: 0.5 }}>{empInitials(name)}</div>;
};

// ── Compresion + upload de imagenes (mismo patron que GeoTeam) ──
const compressImage = (file) => new Promise((resolve, reject) => {
  const timeoutId = setTimeout(() => reject(new Error("Compresión tardó demasiado — imagen muy grande")), 15000);
  const img = new Image();
  const fr = new FileReader();
  fr.onerror = () => { clearTimeout(timeoutId); reject(new Error("FileReader falló")); };
  fr.onload = () => {
    img.onerror = () => { clearTimeout(timeoutId); reject(new Error("No se pudo decodificar la imagen")); };
    img.onload = () => {
      try {
        const MAX = 500;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        clearTimeout(timeoutId);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      } catch (e) { clearTimeout(timeoutId); reject(e); }
    };
    img.src = fr.result;
  };
  fr.readAsDataURL(file);
});
const withTimeout = (promise, ms, label = "operación") => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout ${ms}ms — ${label} no respondió`)), ms))]);

// ── Avatar EPP: obrero segun su puesto ──
// Dibuja lo que TIENE (a color, con el estilo de su puesto: color de casco,
// tipo de camisa) y lo que le FALTA del kit (contorno punteado). Los
// "defaults" (jeans; camisa propia del ingeniero/oficina) se dibujan siempre
// porque no los provee la empresa.
const CAMISAS = {
  blanca_default:   { fill: "#F7F4EE", trim: "#C9C2B7", sleeve: "long" },
  polo_negra:       { fill: "#28231F", trim: "#E8762D", sleeve: "short", lines: true },
  amarilla:         { fill: "#F2CE0D", trim: "#26221F", sleeve: "long", lines: true },
  anaranjada:       { fill: "#E8762D", trim: "#26221F", sleeve: "long", lines: true },
  anaranjada_rayas: { fill: "#E8762D", trim: "#26221F", sleeve: "long", stripes: true },
};
const GLOVES = { guantes: "#2E2B28", guantes_mecanica: "#23272E", guantes_soldadura: "#8B5E34", guantes_carnaza: "#C68B4E", guantes_latex: "#7DB8E8" };

const EppFigure = ({ puesto = "ayudante", has, size = 120 }) => {
  const P = PUESTOS[puesto] || PUESTOS.ayudante;
  const need = (t) => P.req.includes(t);
  const on = (t) => has.has(t);
  const miss = (t) => need(t) && !has.has(t);
  const SKIN = "#E9C6A0", SKIN_D = "#C79A70", JEANS = "#3E5578";
  const DASH = { fill: "rgba(255,255,255,0.45)", stroke: "#B3A89A", strokeWidth: 1.7, strokeDasharray: "4 3" };
  const cam = CAMISAS[P.camisa] || CAMISAS.blanca_default;
  const camisaOn = on("camisa") || !!P.camisaDefault;
  const shirtFill = camisaOn ? cam.fill : "#EDE9E1";
  const shortSleeve = camisaOn && cam.sleeve === "short";
  const pantsRefl = on("pantalon_reflectivo");
  const pantsFill = pantsRefl ? "#49525C" : JEANS;
  const gTypes = ["guantes_soldadura", "guantes_mecanica", "guantes_carnaza", "guantes_latex", "guantes"];
  const gloveOn = gTypes.find((g) => on(g));
  const gloveMiss = gTypes.some((g) => need(g)) && !gloveOn;
  const armUp = camisaOn ? cam.fill : "#EDE9E1";
  const armLo = shortSleeve ? SKIN : armUp;
  const caretaOn = on("careta_soldar");
  return (
    <svg viewBox="0 0 140 200" width={size} height={Math.round(size * 200 / 140)} style={{ display: "block" }}>
      {/* sombra */}
      <ellipse cx="70" cy="188" rx="34" ry="5" fill="rgba(44,42,40,0.10)" />
      {/* pantalon: jeans por defecto / con cinta reflectiva si la tiene */}
      <rect x="50" y="117" width="40" height="10" rx="2" fill={pantsFill} />
      <rect x="50" y="124" width="17" height="47" rx="2" fill={pantsFill} />
      <rect x="73" y="124" width="17" height="47" rx="2" fill={pantsFill} />
      {pantsRefl && (<g><rect x="50" y="142" width="17" height="5" fill="#D9DEE3" /><rect x="73" y="142" width="17" height="5" fill="#D9DEE3" /></g>)}
      {miss("pantalon_reflectivo") && (<g><rect x="50" y="142" width="17" height="5" {...DASH} /><rect x="73" y="142" width="17" height="5" {...DASH} /></g>)}
      {/* polainas de soldador */}
      {on("polainas_soldador") && (<g>
        <rect x="49" y="146" width="19" height="26" rx="3" fill="#8B5E34" stroke="#6B4423" />
        <rect x="72" y="146" width="19" height="26" rx="3" fill="#8B5E34" stroke="#6B4423" />
        <line x1="49" y1="155" x2="68" y2="155" stroke="#6B4423" strokeWidth="1.2" /><line x1="72" y1="155" x2="91" y2="155" stroke="#6B4423" strokeWidth="1.2" />
        <line x1="49" y1="164" x2="68" y2="164" stroke="#6B4423" strokeWidth="1.2" /><line x1="72" y1="164" x2="91" y2="164" stroke="#6B4423" strokeWidth="1.2" />
      </g>)}
      {miss("polainas_soldador") && (<g><rect x="49" y="146" width="19" height="26" rx="3" {...DASH} /><rect x="72" y="146" width="19" height="26" rx="3" {...DASH} /></g>)}
      {/* burros con cubo (botas) */}
      {on("botas") ? (<g>
        <rect x="46" y="167" width="23" height="13" rx="3" fill="#8A5A2B" stroke="#6B4423" />
        <rect x="71" y="167" width="23" height="13" rx="3" fill="#8A5A2B" stroke="#6B4423" />
        <rect x="44" y="178" width="27" height="6" rx="2" fill="#3A2E20" />
        <rect x="69" y="178" width="27" height="6" rx="2" fill="#3A2E20" />
      </g>) : miss("botas") ? (<g>
        <rect x="46" y="167" width="23" height="13" rx="3" {...DASH} />
        <rect x="71" y="167" width="23" height="13" rx="3" {...DASH} />
      </g>) : null}
      {/* brazos (manga corta = antebrazo de piel) */}
      <line x1="50" y1="73" x2="37" y2="93" stroke={armUp} strokeWidth="10" strokeLinecap="round" />
      <line x1="90" y1="73" x2="103" y2="93" stroke={armUp} strokeWidth="10" strokeLinecap="round" />
      <line x1="37" y1="93" x2="30" y2="110" stroke={armLo} strokeWidth="9" strokeLinecap="round" />
      <line x1="103" y1="93" x2="110" y2="110" stroke={armLo} strokeWidth="9" strokeLinecap="round" />
      {/* mangas de soldador */}
      {on("mangas_soldador") && (<g><line x1="37" y1="91" x2="29.5" y2="110" stroke="#8B5E34" strokeWidth="9.5" strokeLinecap="round" /><line x1="103" y1="91" x2="110.5" y2="110" stroke="#8B5E34" strokeWidth="9.5" strokeLinecap="round" /></g>)}
      {/* torso / camisa */}
      <rect x="46" y="64" width="48" height="57" rx="9" fill={shirtFill} stroke="rgba(0,0,0,0.12)" />
      {camisaOn && cam.lines && (<g><rect x="47" y="79" width="46" height="2.5" fill={cam.trim} opacity="0.95" /><rect x="47" y="103" width="46" height="2.5" fill={cam.trim} opacity="0.95" /></g>)}
      {camisaOn && cam.stripes && (<g><rect x="47" y="77" width="46" height="6" fill={cam.trim} /><rect x="47" y="95" width="46" height="6" fill={cam.trim} /></g>)}
      {camisaOn && <path d="M61,64 l9,10 l9,-10" fill="none" stroke={cam.trim} strokeWidth="2" />}
      {miss("camisa") && <rect x="46" y="64" width="48" height="57" rx="9" {...DASH} />}
      {/* chaleco khaki */}
      {on("chaleco") ? (<g>
        <rect x="48" y="64" width="17" height="48" rx="5" fill="#C7B287" stroke="#A8926B" />
        <rect x="75" y="64" width="17" height="48" rx="5" fill="#C7B287" stroke="#A8926B" />
        <rect x="51" y="93" width="11" height="9" rx="1.5" fill="#B7A276" stroke="#A8926B" />
        <rect x="78" y="93" width="11" height="9" rx="1.5" fill="#B7A276" stroke="#A8926B" />
      </g>) : miss("chaleco") ? (
        <rect x="47" y="64" width="46" height="48" rx="6" {...DASH} />
      ) : null}
      {/* delantal de soldador */}
      {on("delantal_soldador") ? (<g>
        <path d="M57,74 L83,74 L88,143 L52,143 Z" fill="#7A6350" stroke="#5D4C3C" />
        <line x1="61" y1="74" x2="66" y2="65" stroke="#5D4C3C" strokeWidth="2.5" /><line x1="79" y1="74" x2="74" y2="65" stroke="#5D4C3C" strokeWidth="2.5" />
        <rect x="62" y="98" width="16" height="12" rx="2" fill="#6B563F" />
      </g>) : miss("delantal_soldador") ? (
        <path d="M57,74 L83,74 L88,143 L52,143 Z" {...DASH} />
      ) : null}
      {/* soporte lumbar */}
      {on("soporte_lumbar") ? (<g>
        <rect x="45" y="106" width="50" height="15" rx="5" fill="#23272E" stroke="#111418" />
        <rect x="55" y="106" width="4" height="15" fill="#E8762D" /><rect x="81" y="106" width="4" height="15" fill="#E8762D" />
      </g>) : miss("soporte_lumbar") ? (
        <rect x="45" y="106" width="50" height="15" rx="5" {...DASH} />
      ) : null}
      {/* arnes */}
      {on("arnes") && (<g><line x1="52" y1="67" x2="88" y2="114" stroke="#23272E" strokeWidth="4" strokeLinecap="round" /><line x1="88" y1="67" x2="52" y2="114" stroke="#23272E" strokeWidth="4" strokeLinecap="round" /><rect x="48" y="110" width="44" height="6" rx="3" fill="#23272E" /></g>)}
      {/* manos / guantes */}
      {gloveOn ? (<g>
        {gloveOn === "guantes_soldadura" && (<g><rect x="23" y="101" width="12" height="9" rx="2" fill="#8B5E34" stroke="#6B4423" /><rect x="105" y="101" width="12" height="9" rx="2" fill="#8B5E34" stroke="#6B4423" /></g>)}
        <circle cx="29" cy="114" r="6.8" fill={GLOVES[gloveOn]} stroke="rgba(0,0,0,0.3)" />
        <circle cx="111" cy="114" r="6.8" fill={GLOVES[gloveOn]} stroke="rgba(0,0,0,0.3)" />
        {gloveOn === "guantes_mecanica" && (<g><line x1="25" y1="111" x2="33" y2="111" stroke="#E8762D" strokeWidth="1.6" /><line x1="107" y1="111" x2="115" y2="111" stroke="#E8762D" strokeWidth="1.6" /></g>)}
      </g>) : gloveMiss ? (<g>
        <circle cx="29" cy="114" r="6.8" {...DASH} />
        <circle cx="111" cy="114" r="6.8" {...DASH} />
      </g>) : (<g>
        <circle cx="29" cy="114" r="6" fill={SKIN} stroke={SKIN_D} />
        <circle cx="111" cy="114" r="6" fill={SKIN} stroke={SKIN_D} />
      </g>)}
      {/* cubrenucas / balaclava */}
      {on("cubrenucas") && <rect x="55" y="49" width="30" height="14" rx="5" fill="#4A5568" />}
      {/* cuello + cabeza */}
      <rect x="64" y="55" width="12" height="10" fill={SKIN} />
      <circle cx="70" cy="44" r="15.5" fill={SKIN} stroke={SKIN_D} strokeWidth="1.2" />
      <circle cx="64.5" cy="43" r="1.7" fill="#3B2F25" /><circle cx="75.5" cy="43" r="1.7" fill="#3B2F25" />
      <path d="M65,50 Q70,54 75,50" fill="none" stroke="#B5836A" strokeWidth="1.4" strokeLinecap="round" />
      {/* tapones auditivos */}
      {on("auditiva") && (<g><circle cx="54.5" cy="44" r="2.6" fill="#E8762D" stroke="#fff" strokeWidth="0.7" /><circle cx="85.5" cy="44" r="2.6" fill="#E8762D" stroke="#fff" strokeWidth="0.7" /></g>)}
      {/* gafas */}
      {on("lentes") ? (
        <rect x="56" y="37.5" width="28" height="8" rx="4" fill="#A9CBEE" opacity="0.92" stroke="#33608F" strokeWidth="1.2" />
      ) : miss("lentes") ? (
        <rect x="56" y="37.5" width="28" height="8" rx="4" {...DASH} />
      ) : null}
      {/* mascarillas (si no hay careta de soldar encima) */}
      {(on("mascarilla") || on("mascarilla_respiratoria")) && !caretaOn && (<g>
        <path d="M58,47 Q70,43 82,47 L79,58 Q70,62 61,58 Z" fill="#ECE9E4" stroke="#B8B0A4" />
        {on("mascarilla_respiratoria") && (<g><circle cx="62" cy="54.5" r="3" fill="#77828C" stroke="#55606B" /><circle cx="78" cy="54.5" r="3" fill="#77828C" stroke="#55606B" /></g>)}
      </g>)}
      {miss("mascarilla_respiratoria") && !caretaOn && <path d="M58,47 Q70,43 82,47 L79,58 Q70,62 61,58 Z" {...DASH} />}
      {/* monja / capucha de carnaza */}
      {on("capucha_carnaza") && (<g>
        <path fillRule="evenodd" d="M70,25.5 a19.5,19.5 0 1 0 0.01,0 Z M70,32.5 a12.5,12.5 0 1 1 -0.01,0 Z" fill="#8B5E34" stroke="#6B4423" />
        <rect x="54" y="58" width="32" height="9" rx="4" fill="#8B5E34" stroke="#6B4423" />
      </g>)}
      {/* careta de esmerilar */}
      {on("careta_esmerilar") ? (<g>
        <rect x="52" y="24" width="36" height="6" rx="3" fill="#37404A" />
        <path d="M52,28 h36 v27 q0,7 -7,7 h-22 q-7,0 -7,-7 Z" fill="#CFE4F7" opacity="0.55" stroke="#7FA5C4" />
      </g>) : miss("careta_esmerilar") ? (
        <path d="M52,28 h36 v27 q0,7 -7,7 h-22 q-7,0 -7,-7 Z" {...DASH} />
      ) : null}
      {/* careta electronica de soldar */}
      {caretaOn ? (<g>
        <rect x="52" y="25" width="36" height="36" rx="6" fill="#3A3F45" stroke="#23272E" strokeWidth="1.3" />
        <rect x="59" y="39" width="22" height="9" rx="2" fill="#14532D" stroke="#0B3B1E" />
        <circle cx="52" cy="42" r="2.6" fill="#E8762D" /><circle cx="88" cy="42" r="2.6" fill="#E8762D" />
      </g>) : miss("careta_soldar") ? (
        <rect x="52" y="25" width="36" height="36" rx="6" {...DASH} />
      ) : null}
      {/* casco (color del puesto) */}
      {P.casco && on("casco") && (<g>
        <path d="M52,35 a18,16 0 0 1 36,0 Z" fill={P.casco} stroke="rgba(0,0,0,0.28)" strokeWidth="1" />
        <rect x="45" y="33" width="50" height="6" rx="3" fill={P.casco} stroke="rgba(0,0,0,0.28)" strokeWidth="1" />
        <rect x="66.5" y="19" width="7" height="8" rx="3" fill={P.casco} stroke="rgba(0,0,0,0.28)" strokeWidth="1" />
      </g>)}
      {P.casco && miss("casco") && (<g>
        <path d="M52,35 a18,16 0 0 1 36,0 Z" {...DASH} />
        <rect x="45" y="33" width="50" height="6" rx="3" {...DASH} />
      </g>)}
      {/* orejeras */}
      {on("auditiva_orejera") ? (<g>
        <path d="M53,24 a17,15 0 0 1 34,0" fill="none" stroke="#23272E" strokeWidth="3.5" />
        <rect x="48" y="37" width="9" height="14" rx="4" fill="#23272E" /><rect x="83" y="37" width="9" height="14" rx="4" fill="#23272E" />
        <circle cx="52.5" cy="44" r="2" fill="#E8762D" /><circle cx="87.5" cy="44" r="2" fill="#E8762D" />
      </g>) : miss("auditiva_orejera") ? (<g>
        <rect x="48" y="37" width="9" height="14" rx="4" {...DASH} /><rect x="83" y="37" width="9" height="14" rx="4" {...DASH} />
      </g>) : null}
    </svg>
  );
};

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
const TextArea = ({ label, ...p }) => <Field label={label}><textarea {...p} style={{ ...inputSt, resize: "vertical", minHeight: 60, ...p.style }} /></Field>;
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

// ── Form de ítem (a nivel de módulo: los re-renders del padre no lo desmontan) ──
// Items viejos sin tipoEpp/descripcion/minStock se normalizan al abrir:
// el tipo se auto-infiere del nombre para no bloquear el guardado.
const ItemFormImpl = ({ item, providers, photoCache, setPhotoCache, onSave, onCancel }) => {
  const [f, setF] = useState(() => item
    ? { codigo: "", descripcion: "", minStock: 2, stock: 0, foto: null, ...item, tipoEpp: item.tipoEpp || inferTipo(item.nombre) || "", codigo: item.codigo || "" }
    : { nombre: "", codigo: "", categoria: "", tipoEpp: "", proveedorId: "", precio: "", stock: 0, minStock: 2, descripcion: "", foto: null });
  const [uploading, setUploading] = useState(false);
  const [tipoTouched, setTipoTouched] = useState(!!(item && item.tipoEpp));
  const u = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type?.startsWith("image/")) { alert("Seleccioná una imagen (JPG/PNG)."); return; }
    setUploading(true);
    try {
      const dataUrl = await compressImage(file);
      const fileId = uid();
      const ok = await withTimeout(store.set(`cp-file-${fileId}`, { name: file.name, type: "image/jpeg", size: dataUrl.length, dataUrl }), 25000, "subir foto");
      if (!ok) throw new Error("Supabase rechazó el upload.");
      setPhotoCache((prev) => ({ ...prev, [fileId]: dataUrl }));
      setF((p) => ({ ...p, foto: { fileId, name: file.name } }));
    } catch (err) { alert("No se pudo subir la foto: " + (err?.message || err)); }
    finally { setUploading(false); }
  };
  const fotoUrl = f.foto?.fileId ? photoCache[f.foto.fileId] : null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      {/* Foto */}
      <div style={{ gridColumn: "1/-1", display: "flex", alignItems: "center", gap: 16, padding: "12px 14px", background: BRAND.beigeLight, border: `1px solid ${BRAND.borderSoft}`, borderRadius: R.md }}>
        <div style={{ width: 78, height: 78, borderRadius: R.md, overflow: "hidden", background: "#fff", border: `1px solid ${BRAND.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {fotoUrl ? <img src={fotoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 34, opacity: 0.5 }}>📷</span>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: BRAND.ink }}>Foto del artículo</div>
          <div style={{ fontSize: 11, color: uploading ? "#B45309" : BRAND.stone }}>{uploading ? "⏳ Subiendo…" : (f.foto ? "Imagen cargada" : "Opcional — ayuda a identificar el EPP.")}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ display: "inline-flex", alignItems: "center", padding: "6px 14px", background: BRAND.orange, color: "#fff", borderRadius: R.sm, cursor: uploading ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700, opacity: uploading ? 0.6 : 1 }}>
              {f.foto ? "Cambiar foto" : "Subir foto"}
              <input type="file" accept="image/*" style={{ display: "none" }} disabled={uploading} onChange={(ev) => { const file = ev.target.files?.[0]; ev.target.value = ""; if (file) handleFile(file); }} />
            </label>
            {f.foto && <Btn small variant="ghost" onClick={() => u("foto", null)}>Quitar</Btn>}
          </div>
        </div>
      </div>
      <div style={{ gridColumn: "1/-1", display: "grid", gridTemplateColumns: "1fr 200px", gap: 14 }}>
        <Input label="Nombre del ítem" placeholder="Ej: Casco tipo I con barbiquejo" value={f.nombre} onChange={(e) => { const v = e.target.value; setF((p) => ({ ...p, nombre: v, tipoEpp: tipoTouched ? p.tipoEpp : (inferTipo(v) || p.tipoEpp || "") })); }} />
        <Input label="Código del producto" placeholder="Ej: CAS-001" value={f.codigo} onChange={(e) => u("codigo", e.target.value)} style={{ fontFamily: FONT.mono, textTransform: "uppercase" }} />
      </div>
      <Select label="Tipo de EPP (se detecta del nombre)" placeholder="— Seleccionar —" options={EPP_TIPOS.map((t) => ({ value: t.value, label: `${t.icon} ${t.label}` }))} value={f.tipoEpp} onChange={(e) => { setTipoTouched(true); u("tipoEpp", e.target.value); }} />
      <Select label="Categoría (área)" placeholder="— Seleccionar —" options={CATEGORIAS} value={f.categoria} onChange={(e) => u("categoria", e.target.value)} />
      <Select label="Proveedor" placeholder="— Seleccionar —" options={providers.map((p) => ({ value: p.id, label: p.nombre }))} value={f.proveedorId} onChange={(e) => u("proveedorId", e.target.value)} />
      <Input label="Precio real (L)" type="number" min="0" step="0.01" value={f.precio} onChange={(e) => u("precio", e.target.value)} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Input label="Stock actual" type="number" min="0" value={f.stock} onChange={(e) => u("stock", e.target.value)} />
        <Input label="Stock mínimo" type="number" min="0" value={f.minStock} onChange={(e) => u("minStock", e.target.value)} />
      </div>
      <div style={{ gridColumn: "1/-1" }}><TextArea label="Descripción" placeholder="Talla, norma, material, especificaciones…" value={f.descripcion} onChange={(e) => u("descripcion", e.target.value)} /></div>
      {!providers.length && <div style={{ gridColumn: "1/-1", background: BRAND.yellowSoft, borderRadius: R.sm, padding: "8px 12px", fontSize: 12.5, color: "#8a6d0b" }}>⚠ No hay proveedores — andá a la pestaña Proveedores primero.</div>}
      <div style={{ gridColumn: "1/-1", display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Btn variant="ghost" onClick={onCancel}>Cancelar</Btn>
        <Btn variant="success" disabled={uploading} onClick={() => {
          if (!f.nombre.trim()) return alert("Poné el nombre del ítem.");
          if (!f.tipoEpp) return alert("Seleccioná el tipo de EPP.");
          if (!f.categoria) return alert("Seleccioná la categoría.");
          if (!f.proveedorId) return alert("Seleccioná el proveedor.");
          if (f.precio === "" || Number(f.precio) < 0) return alert("Poné el precio real.");
          onSave({ ...f, codigo: String(f.codigo || "").trim().toUpperCase(), precio: Number(f.precio), stock: Number(f.stock) || 0, minStock: Number(f.minStock) || 0, id: f.id || uid() });
        }}>{item ? "Guardar cambios" : "Agregar al catálogo"}</Btn>
      </div>
    </div>
  );
};

// ── Form de jornalero (personal por día, fuera de planilla) ──
// Solo nombre + puesto: lo mínimo para clasificar y controlar su EPP.
const JornalFormImpl = ({ jorn, onSave, onCancel }) => {
  const [f, setF] = useState(jorn || { fullName: "", position: "", puesto: "", notas: "" });
  const u = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const kit = PUESTOS[f.puesto];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <div style={{ gridColumn: "1/-1", background: BRAND.blueSoft, border: `1px solid ${BRAND.blue}30`, borderRadius: R.md, padding: "9px 13px", fontSize: 12.5, color: BRAND.ink }}>
        👷 <b>Personal jornal</b>: se le paga por día y no está en planilla, así que no vive en GeoTeam. Acá solo se registra <b>nombre y puesto</b> para clasificarle su EPP y llevar su dotación.
      </div>
      <div style={{ gridColumn: "1/-1" }}><Input label="Nombre completo" placeholder="Ej: Juan Carlos Pérez" value={f.fullName} onChange={(e) => u("fullName", e.target.value)} /></div>
      <Input label="Posición / oficio" placeholder="Ej: Ayudante de concreto" value={f.position} onChange={(e) => u("position", e.target.value)} />
      <Select label="Perfil de EPP (kit por puesto)" placeholder="— Seleccionar —" options={PUESTO_OPTIONS} value={f.puesto} onChange={(e) => u("puesto", e.target.value)} />
      {kit && (
        <div style={{ gridColumn: "1/-1", background: BRAND.beigeLight, border: `1px solid ${BRAND.borderSoft}`, borderRadius: R.md, padding: "9px 13px", fontSize: 12.5, color: BRAND.ink }}>
          Kit de <b>{kit.label}</b>: {kit.req.length ? kit.req.map((t) => `${tipoDef(t).icon} ${reqLabel(f.puesto, t)}`).join(" · ") : "sin EPP de campo requerido"}
        </div>
      )}
      <div style={{ gridColumn: "1/-1" }}><Input label="Notas (opcional)" placeholder="Proyecto donde trabaja, contacto…" value={f.notas} onChange={(e) => u("notas", e.target.value)} /></div>
      <div style={{ gridColumn: "1/-1", display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Btn variant="ghost" onClick={onCancel}>Cancelar</Btn>
        <Btn variant="success" onClick={() => {
          if (!f.fullName.trim()) return alert("Poné el nombre del jornalero.");
          if (!f.puesto) return alert("Seleccioná el perfil de EPP (para saber qué kit le toca).");
          onSave({ ...f, fullName: f.fullName.trim(), id: f.id || uid() });
        }}>{jorn ? "Guardar cambios" : "Agregar jornalero"}</Btn>
      </div>
    </div>
  );
};

// ── Form de proveedor (a nivel de módulo, misma razón) ──
const ProvFormImpl = ({ prov, onSave, onCancel }) => {
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
        <Btn variant="ghost" onClick={onCancel}>Cancelar</Btn>
        <Btn variant="success" onClick={() => { if (!f.nombre.trim()) return alert("Poné el nombre."); onSave({ ...f, id: f.id || uid() }); }}>{prov ? "Guardar cambios" : "Agregar proveedor"}</Btn>
      </div>
    </div>
  );
};

// =====================================================================
export default function SafetyModule({ userRole, userName, onBack, onLogout }) {
  const [providers, setProviders] = useState([]);
  const [items, setItems] = useState([]);
  const [reqs, setReqs] = useState([]);
  const [emps, setEmps] = useState([]);
  // Jornaleros: personal por dia, fuera de planilla/GeoTeam. Solo nombre +
  // puesto, para llevar el control de su dotacion de EPP. Key: ep-jornaleros.
  const [jornaleros, setJornaleros] = useState([]);
  const [photoCache, setPhotoCache] = useState({}); // {fileId: dataUrl}
  const [loaded, setLoaded] = useState(false);
  const [sec, setSec] = useState("catalogo");
  const [modal, setModal] = useState(null); // {t: "cart"|"item"|"prov"|"ficha", ...}
  const [cart, setCart] = useState([]);     // [{key, itemId, dests:[{empId, qty, motivo}]}]
  const [fCat, setFCat] = useState("");
  const [fProv, setFProv] = useState("");
  const [fQ, setFQ] = useState("");
  const [fReqEstado, setFReqEstado] = useState("");
  const [fInvQ, setFInvQ] = useState("");   // busqueda en Inventario (nombre/codigo)
  const [fDotQ, setFDotQ] = useState("");
  const [fDotCo, setFDotCo] = useState("");
  const [fDotPuesto, setFDotPuesto] = useState("");
  const [fDotFalta, setFDotFalta] = useState(false); // solo con faltantes
  const [puestosMap, setPuestosMap] = useState({}); // ep-puestos: {empId: puestoKey} — overrides manuales

  const canManage = ["admin", "costos", "almacenista"].includes(userRole);
  const canDeduct = canManage || userRole === "tesoreria";
  const readOnly = userRole === "gerencia";

  useEffect(() => {
    (async () => {
      const [pv, it, rq, em, pu, jr] = await Promise.all([
        store.get("ep-providers"), store.get("ep-items"), store.get("ep-reqs"), store.get("hr-emps5"), store.get("ep-puestos"), store.get("ep-jornaleros"),
      ]);
      setProviders(Array.isArray(pv) ? pv : []);
      setItems(Array.isArray(it) ? it : []);
      setReqs(Array.isArray(rq) ? rq : []);
      setEmps(Array.isArray(em) ? em : []);
      setPuestosMap(pu && typeof pu === "object" && !Array.isArray(pu) ? pu : {});
      setJornaleros(Array.isArray(jr) ? jr : []);
      setLoaded(true);
    })();
  }, []);

  // Bulk-load de fotos (items + empleados) desde cp-file-<id>, solo las que faltan.
  useEffect(() => {
    const need = new Set();
    for (const it of items) { const f = it.foto?.fileId; if (f && !photoCache[f]) need.add(f); }
    for (const e of emps) { const f = e.photo?.fileId; if (f && !photoCache[f]) need.add(f); }
    if (!need.size) return;
    (async () => {
      const res = await Promise.all([...need].map(async (fid) => { try { const full = await store.get(`cp-file-${fid}`); return [fid, full?.dataUrl || null]; } catch { return [fid, null]; } }));
      setPhotoCache((prev) => { const next = { ...prev }; let ch = false; for (const [fid, url] of res) if (url) { next[fid] = url; ch = true; } return ch ? next : prev; });
    })();
  }, [items, emps]); // eslint-disable-line react-hooks/exhaustive-deps

  const sProv = async (v) => { setProviders(v); const ok = await store.set("ep-providers", v); if (!ok) alert("⚠ No se guardó en la nube (ep-providers)."); return ok; };
  const sItems = async (v) => { setItems(v); const ok = await store.set("ep-items", v); if (!ok) alert("⚠ No se guardó en la nube (ep-items)."); return ok; };
  const sReqs = async (v) => { setReqs(v); const ok = await store.set("ep-reqs", v); if (!ok) alert("⚠ No se guardó en la nube (ep-reqs)."); return ok; };
  // ep-puestos guarda el perfil EPP de TODAS las personas. Se escribe con
  // merge contra la nube (aplicando solo las claves que cambian) para no pisar
  // clasificaciones que otro usuario haya hecho desde que cargó esta pestaña.
  const sPuestos = async (cambios) => {
    let base = puestosMap;
    try { const c = await store.getCloud("ep-puestos"); if (c && typeof c === "object" && !Array.isArray(c)) base = c; } catch { /* nube caída: usar memoria */ }
    const next = { ...base };
    Object.entries(cambios).forEach(([k, v]) => { if (v == null || v === "") delete next[k]; else next[k] = v; });
    setPuestosMap(next);
    const ok = await store.set("ep-puestos", next);
    if (!ok) alert("⚠ No se guardó en la nube (ep-puestos).");
    return ok;
  };
  const rmPuesto = async (id) => {
    let base = puestosMap;
    try { const c = await store.getCloud("ep-puestos"); if (c && typeof c === "object" && !Array.isArray(c)) base = c; } catch { /* nube caída */ }
    const next = { ...base }; delete next[id];
    setPuestosMap(next);
    return await store.set("ep-puestos", next);
  };
  const sJorn = async (v) => { setJornaleros(v); const ok = await store.set("ep-jornaleros", v); if (!ok) alert("⚠ No se guardó en la nube (ep-jornaleros)."); return ok; };

  const provName = (id) => providers.find((p) => p.id === id)?.nombre || "—";
  const itemById = (id) => items.find((i) => i.id === id);
  // PERSONAS = empleados de GeoTeam + jornaleros (personal por dia, fuera de
  // planilla). Los jornaleros llevan company:"jornal" y esJornal:true; para
  // EPP se tratan igual que cualquier colaborador (kit por puesto, ficha,
  // requisiciones), solo que no tienen foto ni DNI.
  const people = useMemo(() => [
    ...emps,
    ...jornaleros.map((j) => ({ ...j, company: "jornal", status: j.status || "active", esJornal: true })),
  ], [emps, jornaleros]);
  const empById = (id) => people.find((e) => e.id === id);
  const empPhoto = (e) => (e?.photo?.fileId ? photoCache[e.photo.fileId] : null);
  const itemPhoto = (it) => (it?.foto?.fileId ? photoCache[it.foto.fileId] : null);
  const activeEmps = useMemo(() => people.filter((e) => e.status === "active").sort((a, b) => String(a.fullName).localeCompare(b.fullName)), [people]);

  // Tipo de EPP resuelto: el guardado gana; si falta o es "otro", se infiere
  // del nombre (asi los items/lineas viejos SI llenan el avatar).
  const tipoDeItem = (it) => (it?.tipoEpp && it.tipoEpp !== "otro") ? it.tipoEpp : (inferTipo(it?.nombre) || it?.tipoEpp || "otro");
  const tipoDeLinea = (l) => {
    if (l?.tipoEpp && l.tipoEpp !== "otro") return l.tipoEpp;
    const it = itemById(l?.itemId);
    if (it?.tipoEpp && it.tipoEpp !== "otro") return it.tipoEpp;
    return inferTipo(l?.nombre) || l?.tipoEpp || "otro";
  };

  // ── Dotacion: que EPP tiene cada colaborador (de requisiciones ENTREGADAS),
  // evaluado contra el KIT de su puesto (override ep-puestos > auto por posicion) ──
  const dotacionDe = useMemo(() => {
    const map = {}; // empId -> {entregado:{}, pend:{}}
    for (const r of reqs) {
      if (r.estado === "rechazada") continue;
      const entregada = r.estado === "entregada";
      for (const l of r.lineas || []) {
        if (!l.paraEmpId) continue;
        if (!map[l.paraEmpId]) map[l.paraEmpId] = { entregado: {}, pend: {} };
        const bucket = entregada ? map[l.paraEmpId].entregado : map[l.paraEmpId].pend;
        const tipo = tipoDeLinea(l);
        const k = (l.itemId || l.nombre) + "|" + tipo;
        if (!bucket[k]) bucket[k] = { tipo, nombre: l.nombre, codigo: l.codigo || itemById(l.itemId)?.codigo || "", qty: 0, reqs: [], lastDate: null, motivos: {} };
        bucket[k].qty += l.qty;
        if (!bucket[k].reqs.includes(r.numero)) bucket[k].reqs.push(r.numero);
        bucket[k].motivos[l.motivo] = (bucket[k].motivos[l.motivo] || 0) + l.qty;
        const d = r.entregadaAt || r.fecha;
        if (!bucket[k].lastDate || String(d) > String(bucket[k].lastDate)) bucket[k].lastDate = d;
      }
    }
    const out = {};
    for (const e of people) {
      // Prioridad: override manual > puesto propio (jornaleros lo eligen al
      // registrarse) > inferencia automatica por nombre/posicion.
      const puesto = puestosMap[e.id] || e.puesto || autoPuesto(e);
      const kit = PUESTOS[puesto] || PUESTOS.ayudante;
      const m = map[e.id] || { entregado: {}, pend: {} };
      const tiene = Object.values(m.entregado);
      const tipos = new Set(tiene.map((x) => x.tipo));
      const falta = kit.req.filter((t) => !tipos.has(t));
      out[e.id] = { tiene, pend: Object.values(m.pend), tipos, falta, puesto, completo: kit.req.length > 0 && falta.length === 0 };
    }
    return out;
  }, [reqs, people, items, puestosMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const perdidas = useMemo(() => {
    const o = [];
    for (const r of reqs) { if (r.estado === "rechazada") continue; (r.lineas || []).forEach((l, idx) => { if (l.motivo === "perdida") o.push({ req: r, linea: l, idx }); }); }
    return o.sort((a, b) => String(b.req.fecha).localeCompare(String(a.req.fecha)));
  }, [reqs]);
  const perdidasPend = perdidas.filter((p) => !p.linea.deducido);
  const reqsPendientes = reqs.filter((r) => r.estado === "pendiente").length;

  // ── Carrito (multi-colaborador por item) ──
  const addToCart = (item) => {
    setCart((c) => {
      const ex = c.find((l) => l.itemId === item.id);
      if (ex) return c.map((l) => (l === ex ? { ...l, dests: l.dests.map((d, i) => (i === 0 ? { ...d, qty: (Number(d.qty) || 0) + 1 } : d)) } : l));
      return [...c, { key: uid(), itemId: item.id, dests: [{ empId: "", qty: 1, motivo: "" }] }];
    });
  };
  const cartUnits = cart.reduce((s, l) => s + l.dests.reduce((a, d) => a + (Number(d.qty) || 0), 0), 0);
  const cartTotal = cart.reduce((s, l) => s + (Number(itemById(l.itemId)?.precio) || 0) * l.dests.reduce((a, d) => a + (Number(d.qty) || 0), 0), 0);
  const lineUnits = (l) => l.dests.reduce((a, d) => a + (Number(d.qty) || 0), 0);
  const updDest = (lineKey, di, patch) => setCart((c) => c.map((l) => (l.key === lineKey ? { ...l, dests: l.dests.map((d, i) => (i === di ? { ...d, ...patch } : d)) } : l)));
  const addDest = (lineKey) => setCart((c) => c.map((l) => (l.key === lineKey ? { ...l, dests: [...l.dests, { empId: "", qty: 1, motivo: "" }] } : l)));
  const rmDest = (lineKey, di) => setCart((c) => c.map((l) => (l.key === lineKey ? { ...l, dests: l.dests.filter((_, i) => i !== di) } : l)).filter((l) => l.dests.length));

  const enviarRequisicion = async () => {
    if (!cart.length) return;
    const lineas = [];
    for (const l of cart) {
      const it = itemById(l.itemId) || {};
      for (const d of l.dests) {
        if (!Number(d.qty) || Number(d.qty) < 1) return alert(`Cantidad inválida en "${it.nombre}".`);
        if (!d.empId) return alert(`Falta indicar PARA QUIÉN va "${it.nombre}".`);
        if (!d.motivo) return alert(`Falta el MOTIVO de "${it.nombre}".`);
        const emp = empById(d.empId);
        if (!emp) return alert(`La persona asignada a "${it.nombre}" ya no existe (¿se borró?). Volvé a seleccionarla.`);
        lineas.push({ itemId: l.itemId, nombre: it.nombre, codigo: it.codigo || "", categoria: it.categoria, tipoEpp: tipoDeItem(it), proveedor: provName(it.proveedorId), precio: Number(it.precio) || 0, qty: Number(d.qty), paraEmpId: d.empId, paraNombre: emp.fullName || "—", paraEmpresa: emp.company || "", motivo: d.motivo, deducido: false });
      }
    }
    const numero = "EPP-" + String(reqs.length + 1).padStart(3, "0");
    const req = { id: uid(), numero, solicitante: userName, fecha: new Date().toISOString(), estado: "pendiente", lineas, total: lineas.reduce((s, l) => s + l.precio * l.qty, 0) };
    const ok = await sReqs([req, ...reqs]);
    if (!ok) return;
    const tienePerdida = lineas.some((l) => l.motivo === "perdida");
    setCart([]); setModal(null); setSec("requisiciones");
    alert(`✅ Requisición ${numero} enviada.` + (tienePerdida ? "\n\n⚠ Incluye PÉRDIDA/EXTRAVÍO: quedó registrada en \"Descuentos planilla\"." : ""));
  };

  const setEstadoReq = async (req, estado) => {
    const verbo = { aprobada: "APROBAR", rechazada: "RECHAZAR", entregada: "marcar ENTREGADA" }[estado];
    if (!confirm(`¿${verbo} la requisición ${req.numero}?` + (estado === "entregada" ? "\n\nSe descontará el stock y el EPP quedará asignado a cada colaborador en su ficha de dotación." : ""))) return;
    const upd = reqs.map((r) => (r.id === req.id ? { ...r, estado, [estado + "Por"]: userName, [estado + "At"]: new Date().toISOString() } : r));
    const ok = await sReqs(upd);
    if (!ok) return;
    if (estado === "entregada") {
      const ni = items.map((it) => { const q = (req.lineas || []).filter((l) => l.itemId === it.id).reduce((s, l) => s + l.qty, 0); return q ? { ...it, stock: Math.max(0, (Number(it.stock) || 0) - q) } : it; });
      const ok2 = await sItems(ni);
      if (!ok2) alert("⚠ Quedó ENTREGADA pero el stock NO se actualizó. Ajustalo en Inventario.");
    }
  };
  const toggleDeducido = async (reqId, idx) => {
    const upd = reqs.map((r) => r.id !== reqId ? r : { ...r, lineas: r.lineas.map((l, i) => (i === idx ? { ...l, deducido: !l.deducido, deducidoPor: !l.deducido ? userName : undefined, deducidoAt: !l.deducido ? new Date().toISOString() : undefined } : l)) });
    await sReqs(upd);
  };

  // ══════════════════════════ CATALOGO ══════════════════════════
  const renderCatalogo = () => {
    const vis = items.filter((it) => (!fCat || it.categoria === fCat) && (!fProv || it.proveedorId === fProv)
      // Se busca tambien en la descripcion: mientras haya items con el codigo
      // anotado ahi (dato viejo), teclearlo igual encuentra el item.
      && (!fQ || norm(it.nombre).includes(norm(fQ)) || norm(it.codigo).includes(norm(fQ)) || norm(it.descripcion).includes(norm(fQ)))
    ).sort((a, b) => String(a.nombre).localeCompare(b.nombre));
    return (
      <div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16 }}>
          <div style={{ flex: "1 1 220px" }}><Input label="Buscar" placeholder="Casco, guantes, careta, código…" value={fQ} onChange={(e) => setFQ(e.target.value)} /></div>
          <div style={{ flex: "0 1 200px" }}><Select label="Categoría" placeholder="Todas" options={CATEGORIAS} value={fCat} onChange={(e) => setFCat(e.target.value)} /></div>
          <div style={{ flex: "0 1 200px" }}><Select label="Proveedor" placeholder="Todos" options={providers.map((p) => ({ value: p.id, label: p.nombre }))} value={fProv} onChange={(e) => setFProv(e.target.value)} /></div>
          {canManage && <Btn variant="ghost" onClick={() => setModal({ t: "item" })}>+ Nuevo ítem</Btn>}
        </div>
        {!items.length ? (
          <div style={{ textAlign: "center", padding: 60, color: BRAND.stone, background: "#fff", borderRadius: R.lg, border: `1px dashed ${BRAND.border}` }}>
            <div style={{ fontSize: 40 }}>🦺</div>
            <div style={{ fontWeight: 700, color: BRAND.ink, marginTop: 8 }}>El catálogo está vacío</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>{canManage ? "Cargá los proveedores y luego agregá ítems (con foto, tipo de EPP y precio real)." : "El administrador aún no carga ítems de EPP."}</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 14 }}>
            {vis.map((it) => {
              const sinStock = (Number(it.stock) || 0) <= 0;
              const bajo = !sinStock && (Number(it.stock) || 0) <= (Number(it.minStock) || 0);
              const foto = itemPhoto(it); const tp = tipoDef(tipoDeItem(it));
              return (
                <div key={it.id} style={{ background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.lg, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: BRAND.shadowSm }}>
                  <div style={{ height: 130, background: foto ? "#F1EDE5" : BRAND.beigeLight, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", borderBottom: `1px solid ${BRAND.borderSoft}` }}>
                    {foto ? <img src={foto} alt={it.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ fontSize: 46, opacity: 0.5 }}>{catIcon(it.categoria)}</div>}
                    <span style={{ position: "absolute", top: 8, left: 8 }}><Chip color={BRAND.graphite} bg="rgba(255,255,255,0.9)">{tp.icon} {tp.label}</Chip></span>
                  </div>
                  <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 14.5, color: BRAND.charcoal, lineHeight: 1.25 }}>{it.nombre}</div>
                    {it.codigo && <div style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, color: BRAND.orange, letterSpacing: 0.4 }}>#{it.codigo}</div>}
                    {it.descripcion && <div style={{ fontSize: 11.5, color: BRAND.stone, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{it.descripcion}</div>}
                    <div style={{ fontSize: 12, color: BRAND.stone }}>🏪 {provName(it.proveedorId)}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", paddingTop: 4 }}>
                      <div style={{ fontSize: 17, fontWeight: 800, color: GREEN }}>{fmtL(it.precio)}</div>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: sinStock ? BRAND.red : bajo ? "#B45309" : BRAND.graphite }}>{sinStock ? "Sin stock" : `Stock: ${it.stock}${bajo ? " ⚠" : ""}`}</div>
                    </div>
                    {!readOnly && <Btn onClick={() => addToCart(it)} style={{ width: "100%" }}>🛒 Agregar al carrito</Btn>}
                    {canManage && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <Btn small variant="ghost" style={{ flex: 1 }} onClick={() => setModal({ t: "item", item: it })}>✏️ Editar</Btn>
                        <Btn small variant="ghost" style={{ color: BRAND.red }} onClick={async () => { if (!confirm(`¿Borrar "${it.nombre}" del catálogo?\n\nLas requisiciones ya creadas no se tocan.`)) return; await sItems(items.filter((x) => x.id !== it.id)); }}>🗑</Btn>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {!vis.length && <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 30, color: BRAND.stone, fontSize: 13 }}>Sin resultados con esos filtros.</div>}
          </div>
        )}
      </div>
    );
  };

  // ══════════════════════════ CARRITO ══════════════════════════
  const CartModal = () => (
    <Modal title={`🛒 Carrito de EPP (${cartUnits} uds)`} onClose={() => setModal(null)} width={860}>
      {!cart.length ? (
        <div style={{ textAlign: "center", padding: 30, color: BRAND.stone }}>El carrito está vacío. Agregá EPP desde el catálogo.</div>
      ) : (
        <>
          <div style={{ background: BRAND.blueSoft, border: `1px solid ${BRAND.blue}30`, borderRadius: R.md, padding: "10px 14px", fontSize: 12.5, color: BRAND.ink, marginBottom: 14 }}>
            Por cada ítem indicá <b>a qué colaborador(es)</b> va y el <b>motivo</b>. Podés repartir un mismo ítem entre varias personas (ej: 10 guantes → 4 a uno, 6 a otro) con <b>“+ Agregar colaborador”</b>.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {cart.map((l) => {
              const it = itemById(l.itemId) || {};
              return (
                <div key={l.key} style={{ background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.md, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 10 }}>
                    <div style={{ fontWeight: 800, fontSize: 13.5, color: BRAND.charcoal }}>{tipoDef(tipoDeItem(it)).icon} {it.nombre}{it.codigo ? <span style={{ fontFamily: FONT.mono, fontSize: 11, color: BRAND.orange, fontWeight: 700 }}> #{it.codigo}</span> : null} <span style={{ fontWeight: 600, color: GREEN }}>· {fmtL(it.precio)}</span> <span style={{ fontWeight: 600, color: BRAND.stone, fontSize: 12 }}>· {lineUnits(l)} uds</span></div>
                    <button onClick={() => setCart((c) => c.filter((x) => x.key !== l.key))} style={{ background: "none", border: "none", color: BRAND.red, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Quitar ítem</button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {l.dests.map((d, di) => (
                      <div key={di}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 1fr 30px", gap: 8, alignItems: "end" }}>
                          <Select label={di === 0 ? "Para (colaborador)" : ""} placeholder="— Seleccionar —" value={d.empId} onChange={(e) => updDest(l.key, di, { empId: e.target.value })} options={activeEmps.map((e) => ({ value: e.id, label: `${e.fullName} · ${coTag(e.company)}` }))} />
                          <Input label={di === 0 ? "Cant." : ""} type="number" min="1" value={d.qty} onChange={(e) => updDest(l.key, di, { qty: e.target.value })} />
                          <Select label={di === 0 ? "Motivo" : ""} placeholder="— Seleccionar —" value={d.motivo} onChange={(e) => updDest(l.key, di, { motivo: e.target.value })} options={MOTIVOS.map((m) => ({ value: m.value, label: m.label }))} />
                          <button onClick={() => rmDest(l.key, di)} title="Quitar colaborador" style={{ height: 38, background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.sm, color: BRAND.red, cursor: "pointer", fontWeight: 800 }}>×</button>
                        </div>
                        {d.motivo === "perdida" && (
                          <div style={{ marginTop: 5, background: BRAND.redSoft, border: `1px solid ${BRAND.red}40`, borderRadius: R.sm, padding: "5px 9px", fontSize: 11.5, fontWeight: 700, color: BRAND.red }}>
                            ⚠ {fmtL((Number(it.precio) || 0) * (Number(d.qty) || 1))} se deducirán de la planilla de {empById(d.empId)?.fullName || "el colaborador"}.
                          </div>
                        )}
                      </div>
                    ))}
                    <div><Btn small variant="ghost" onClick={() => addDest(l.key)}>+ Agregar colaborador</Btn></div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: BRAND.charcoal }}>Total: <span style={{ color: GREEN }}>{fmtL(cartTotal)}</span></div>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn variant="ghost" onClick={() => setModal(null)}>Seguir viendo</Btn>
              <Btn variant="success" onClick={enviarRequisicion}>📨 Enviar requisición</Btn>
            </div>
          </div>
        </>
      )}
    </Modal>
  );

  // ══════════════════════════ REQUISICIONES ══════════════════════════
  const renderRequisiciones = () => {
    const vis = reqs.filter((r) => !fReqEstado || r.estado === fReqEstado);
    return (
      <div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ flex: "0 1 220px" }}><Select label="Estado" placeholder="Todos" value={fReqEstado} onChange={(e) => setFReqEstado(e.target.value)} options={Object.entries(ESTADOS).map(([v, d]) => ({ value: v, label: d.label }))} /></div>
          <div style={{ fontSize: 12.5, color: BRAND.stone, paddingBottom: 10 }}>{vis.length} requisición(es)</div>
        </div>
        {!vis.length && <div style={{ textAlign: "center", padding: 50, color: BRAND.stone, background: "#fff", borderRadius: R.lg, border: `1px dashed ${BRAND.border}` }}>Sin requisiciones todavía. Se crean desde el catálogo con el carrito 🛒.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {vis.map((r) => {
            const est = ESTADOS[r.estado] || ESTADOS.pendiente;
            const tienePerdida = (r.lineas || []).some((l) => l.motivo === "perdida");
            return (
              <div key={r.id} style={{ background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.lg, overflow: "hidden", boxShadow: BRAND.shadowSm }}>
                {tienePerdida && <div style={{ background: BRAND.redSoft, borderBottom: `1px solid ${BRAND.red}30`, padding: "7px 16px", fontSize: 12, fontWeight: 800, color: BRAND.red }}>⚠ CONTIENE PÉRDIDA/EXTRAVÍO — genera descuento en planilla</div>}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 16px", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: FONT.mono, fontWeight: 800, fontSize: 14, color: BRAND.orange }}>{r.numero}</span>
                    <Chip color={est.color} bg={est.bg}>{est.label}</Chip>
                    <span style={{ fontSize: 12.5, color: BRAND.graphite }}>Solicitó: <b>{r.solicitante}</b> · {fmtDate(r.fecha)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontWeight: 800, color: GREEN, fontSize: 14 }}>{fmtL(r.total)}</span>
                    {canManage && r.estado === "pendiente" && <><Btn small variant="success" onClick={() => setEstadoReq(r, "aprobada")}>✓ Aprobar</Btn><Btn small variant="danger" onClick={() => setEstadoReq(r, "rechazada")}>✕ Rechazar</Btn></>}
                    {canManage && r.estado === "aprobada" && <Btn small variant="info" onClick={() => setEstadoReq(r, "entregada")}>📦 Marcar entregada</Btn>}
                    {userRole === "admin" && <Btn small variant="ghost" style={{ color: BRAND.red }} onClick={async () => { if (!confirm(`¿ELIMINAR la requisición ${r.numero}?\n\nSe borra del historial. No se puede deshacer.`)) return; await sReqs(reqs.filter((x) => x.id !== r.id)); }}>🗑</Btn>}
                  </div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr style={{ background: BRAND.beigeLight }}><th style={th}>Código</th><th style={th}>Ítem</th><th style={th}>Tipo</th><th style={th}>Proveedor</th><th style={th}>Para</th><th style={th}>Motivo</th><th style={{ ...th, textAlign: "right" }}>Cant.</th><th style={{ ...th, textAlign: "right" }}>Precio</th><th style={{ ...th, textAlign: "right" }}>Subtotal</th></tr></thead>
                    <tbody>
                      {(r.lineas || []).map((l, i) => {
                        const m = motivoDef(l.motivo);
                        return (
                          <tr key={i}>
                            <td style={{ ...td, fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, color: BRAND.orange }}>{l.codigo || itemById(l.itemId)?.codigo || "—"}</td>
                            <td style={{ ...td, fontWeight: 700 }}>{l.nombre}</td>
                            <td style={td}>{tipoDef(tipoDeLinea(l)).icon} {tipoDef(tipoDeLinea(l)).label}</td>
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

  // ══════════════════════════ DOTACION (fichas visuales por puesto) ══════════════════════════
  const renderDotacion = () => {
    let list = activeEmps;
    if (fDotCo) list = list.filter((e) => e.company === fDotCo);
    if (fDotPuesto) list = list.filter((e) => dotacionDe[e.id]?.puesto === fDotPuesto);
    if (fDotQ) list = list.filter((e) => norm(e.fullName).includes(norm(fDotQ)));
    if (fDotFalta) list = list.filter((e) => { const d = dotacionDe[e.id]; return d && d.puesto !== "oficina" && !d.completo; });
    const campo = activeEmps.filter((e) => dotacionDe[e.id]?.puesto !== "oficina");
    const completos = campo.filter((e) => dotacionDe[e.id]?.completo).length;
    const oficina = activeEmps.length - campo.length;
    return (
      <div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
          <div style={{ flex: "1 1 190px", background: "#fff", border: `1px solid ${BRAND.border}`, borderLeft: `4px solid ${GREEN}`, borderRadius: R.md, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.graphite, textTransform: "uppercase", letterSpacing: 0.5 }}>Con EPP completo</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: GREEN, marginTop: 4 }}>{completos} <span style={{ fontSize: 15, color: BRAND.stone, fontWeight: 700 }}>/ {campo.length}</span></div>
            <div style={{ fontSize: 12, color: BRAND.stone }}>personal de campo, según el kit de su puesto</div>
          </div>
          <div style={{ flex: "1 1 190px", background: "#fff", border: `1px solid ${BRAND.border}`, borderLeft: `4px solid ${BRAND.red}`, borderRadius: R.md, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.graphite, textTransform: "uppercase", letterSpacing: 0.5 }}>Con faltantes</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: BRAND.red, marginTop: 4 }}>{campo.length - completos}</div>
            <div style={{ fontSize: 12, color: BRAND.stone }}>colaboradores a completar dotación</div>
          </div>
          <div style={{ flex: "1 1 190px", background: "#fff", border: `1px solid ${BRAND.border}`, borderLeft: `4px solid ${BRAND.ash}`, borderRadius: R.md, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.graphite, textTransform: "uppercase", letterSpacing: 0.5 }}>Oficina / Admin</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: BRAND.graphite, marginTop: 4 }}>{oficina}</div>
            <div style={{ fontSize: 12, color: BRAND.stone }}>sin dotación de campo requerida</div>
          </div>
          <div style={{ flex: "1 1 190px", background: "#fff", border: `1px solid ${BRAND.border}`, borderLeft: `4px solid #B45309`, borderRadius: R.md, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.graphite, textTransform: "uppercase", letterSpacing: 0.5 }}>Personal jornal</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#B45309", marginTop: 4 }}>{jornaleros.filter((j) => (j.status || "active") === "active").length}</div>
            <div style={{ fontSize: 12, color: BRAND.stone }}>por día, fuera de planilla</div>
          </div>
        </div>
        {/* Leyenda de cascos por puesto */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginBottom: 14, background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.md, padding: "9px 14px", fontSize: 11.5, color: BRAND.graphite }}>
          <b style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5 }}>Cascos por puesto:</b>
          {[["#F6F5F2", "Ingeniero"], ["#E8762D", "Operadores Ø grande y Ø pequeño"], ["#F2C40F", "Ayudantes / Técnicos"], ["#2F6FE0", "Mecánicos"]].map(([c, l]) => (
            <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 11, height: 11, borderRadius: "50%", background: c, border: "1px solid rgba(0,0,0,0.25)", display: "inline-block" }} />{l}</span>
          ))}
          <span style={{ color: BRAND.stone }}>· Soldador y tornero: kit especial · Jeans: por defecto en todos</span>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16 }}>
          <div style={{ flex: "1 1 200px" }}><Input label="Buscar colaborador" placeholder="Nombre…" value={fDotQ} onChange={(e) => setFDotQ(e.target.value)} /></div>
          <div style={{ flex: "0 1 180px" }}><Select label="Empresa" placeholder="Todas" options={[{ value: "geotecnica", label: "Geotecnica" }, { value: "subterra", label: "Subterra" }, { value: "jornal", label: "Personal jornal" }]} value={fDotCo} onChange={(e) => setFDotCo(e.target.value)} /></div>
          <div style={{ flex: "0 1 200px" }}><Select label="Puesto" placeholder="Todos" options={PUESTO_OPTIONS} value={fDotPuesto} onChange={(e) => setFDotPuesto(e.target.value)} /></div>
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700, color: BRAND.ink, paddingBottom: 9, cursor: "pointer" }}>
            <input type="checkbox" checked={fDotFalta} onChange={(e) => setFDotFalta(e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} /> Solo con faltantes
          </label>
          {canManage && <Btn variant="ghost" onClick={() => setModal({ t: "jornal" })} style={{ marginBottom: 1 }}>+ Personal jornal</Btn>}
        </div>
        {!people.length ? (
          <div style={{ textAlign: "center", padding: 50, color: BRAND.stone, background: "#fff", borderRadius: R.lg, border: `1px dashed ${BRAND.border}` }}>No hay personal cargado. Los empleados se leen de GeoTeam; los jornaleros se agregan con <b>+ Personal jornal</b>.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 14 }}>
            {list.map((e) => {
              const dot = dotacionDe[e.id] || { tiene: [], falta: [], tipos: new Set(), completo: false, pend: [], puesto: "ayudante" };
              const kit = PUESTOS[dot.puesto] || PUESTOS.ayudante;
              return (
                <div key={e.id} onClick={() => setModal({ t: "ficha", empId: e.id })} style={{ background: "#fff", border: `1px solid ${dot.completo ? GREEN + "55" : BRAND.border}`, borderRadius: R.lg, padding: 14, cursor: "pointer", boxShadow: BRAND.shadowSm, transition: "transform .1s" }} onMouseEnter={(ev) => (ev.currentTarget.style.transform = "translateY(-2px)")} onMouseLeave={(ev) => (ev.currentTarget.style.transform = "none")}>
                  <div style={{ display: "flex", gap: 12 }}>
                    <div style={{ background: BRAND.beigeLight, borderRadius: R.md, padding: 4, border: `1px solid ${BRAND.borderSoft}` }}><EppFigure puesto={dot.puesto} has={dot.tipos} size={72} /></div>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <EmpAvatar name={e.fullName} dataUrl={empPhoto(e)} size={34} borderRadius={8} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 13, color: BRAND.charcoal, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.fullName}</div>
                          <div style={{ fontSize: 10.5, color: BRAND.stone }}>
                            {e.esJornal ? <span style={{ color: "#B45309", fontWeight: 800 }}>JORNAL</span> : coTag(e.company)} · {e.position || "—"}
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: 9.5, fontWeight: 800, color: "#B45309", letterSpacing: 0.4, textTransform: "uppercase" }}>{kit.label}</div>
                      {dot.puesto === "oficina"
                        ? <Chip color={BRAND.graphite} bg={BRAND.beigeDeep}>SIN EPP REQUERIDO</Chip>
                        : dot.completo
                          ? <Chip color={GREEN} bg={BRAND.greenSoft}>✓ EPP COMPLETO</Chip>
                          : <div style={{ display: "flex", flexWrap: "wrap", gap: 3, alignItems: "center" }}><span style={{ fontSize: 10.5, fontWeight: 800, color: BRAND.red }}>FALTA:</span>{dot.falta.map((t) => <span key={t} title={reqLabel(dot.puesto, t)} style={{ fontSize: 15 }}>{tipoDef(t).icon}</span>)}</div>}
                    </div>
                  </div>
                </div>
              );
            })}
            {!list.length && <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 30, color: BRAND.stone, fontSize: 13 }}>Sin colaboradores con esos filtros.</div>}
          </div>
        )}
      </div>
    );
  };

  const FichaModal = ({ empId }) => {
    const e = empById(empId); if (!e) return null;
    const dot = dotacionDe[empId] || { tiene: [], pend: [], falta: [], tipos: new Set(), completo: false, puesto: "ayudante" };
    const kit = PUESTOS[dot.puesto] || PUESTOS.ayudante;
    return (
      <Modal title="Ficha de dotación EPP" onClose={() => setModal(null)} width={760}>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 16 }}>
          <div style={{ background: BRAND.beigeLight, borderRadius: R.lg, padding: 10, border: `1px solid ${BRAND.borderSoft}` }}><EppFigure puesto={dot.puesto} has={dot.tipos} size={150} /></div>
          <div style={{ flex: 1, minWidth: 230, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <EmpAvatar name={e.fullName} dataUrl={empPhoto(e)} size={56} borderRadius={12} />
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: BRAND.charcoal }}>{e.fullName}</div>
                <div style={{ fontSize: 12.5, color: BRAND.stone }}>
                  {e.position || "—"} · {e.esJornal ? <b style={{ color: "#B45309" }}>PERSONAL JORNAL</b> : coTag(e.company)}
                </div>
                {e.dni && <div style={{ fontSize: 11.5, color: BRAND.stone, fontFamily: FONT.mono }}>{e.dni}</div>}
                {e.esJornal && e.notas && <div style={{ fontSize: 11.5, color: BRAND.stone }}>{e.notas}</div>}
              </div>
            </div>
            {/* Perfil de EPP: override manual (ep-puestos) gana sobre el automatico */}
            {canManage ? (
              <Select label="Perfil de EPP (según su puesto)" options={PUESTO_OPTIONS} value={dot.puesto} onChange={async (ev) => {
                const nuevo = ev.target.value;
                await sPuestos({ [empId]: nuevo });
                // Si es jornalero, sincronizar su propio registro para que
                // "Editar jornalero" no muestre (ni reponga) el puesto viejo.
                if (e.esJornal) await sJorn(jornaleros.map((j) => (j.id === empId ? { ...j, puesto: nuevo } : j)));
              }} />
            ) : (
              <div><Chip color="#B45309" bg="rgba(180,83,9,0.10)">{kit.label.toUpperCase()}</Chip></div>
            )}
            {e.esJornal && canManage && (
              <div style={{ display: "flex", gap: 8 }}>
                {/* El puesto efectivo (override de la ficha) manda sobre el guardado */}
                <Btn small variant="ghost" onClick={() => setModal({ t: "jornal", jorn: { ...jornaleros.find((j) => j.id === empId), puesto: dot.puesto } })}>✏️ Editar jornalero</Btn>
                <Btn small variant="ghost" style={{ color: BRAND.red }} onClick={async () => {
                  const tieneEpp = dot.tiene.length, enTramite = dot.pend.length;
                  if (!confirm(`¿Quitar a "${e.fullName}" del personal jornal?`
                    + (tieneEpp ? `\n\n• Tiene ${tieneEpp} EPP entregado(s).` : "")
                    + (enTramite ? `\n• Tiene ${enTramite} EPP en trámite (requisición aprobada sin entregar) — quedaría sin dueño visible.` : "")
                    + ((tieneEpp || enTramite) ? `\n\nLas requisiciones NO se borran (queda el historial).` : ""))) return;
                  const ok = await sJorn(jornaleros.filter((j) => j.id !== empId));
                  if (!ok) return;
                  // Limpiar su perfil de EPP para no dejar basura en ep-puestos.
                  if (puestosMap[empId] != null) await rmPuesto(empId);
                  setModal(null);
                }}>🗑 Quitar</Btn>
              </div>
            )}
            <div>{dot.puesto === "oficina"
              ? <Chip color={BRAND.graphite} bg={BRAND.beigeDeep} style={{ fontSize: 12, padding: "5px 12px" }}>SIN DOTACIÓN DE CAMPO REQUERIDA</Chip>
              : dot.completo
                ? <Chip color={GREEN} bg={BRAND.greenSoft} style={{ fontSize: 12, padding: "5px 12px" }}>✓ KIT DE {kit.label.toUpperCase()} COMPLETO</Chip>
                : <Chip color={BRAND.red} bg={BRAND.redSoft} style={{ fontSize: 12, padding: "5px 12px" }}>FALTAN {dot.falta.length} DEL KIT DE {kit.label.toUpperCase()}</Chip>}</div>
            {/* Checklist del kit del puesto */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
              {kit.req.map((t) => { const ok = dot.tipos.has(t); return (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: ok ? BRAND.charcoal : BRAND.stone }}>
                  <span style={{ fontSize: 16 }}>{tipoDef(t).icon}</span>
                  <span style={{ flex: 1, fontWeight: ok ? 700 : 400 }}>{reqLabel(dot.puesto, t)}</span>
                  {ok ? <span style={{ color: GREEN, fontWeight: 800 }}>✓ tiene</span> : <span style={{ color: BRAND.red, fontWeight: 800 }}>✗ falta</span>}
                </div>
              ); })}
            </div>
          </div>
        </div>
        {kit.notas && <div style={{ background: BRAND.beigeLight, border: `1px solid ${BRAND.borderSoft}`, borderRadius: R.md, padding: "9px 13px", fontSize: 12.5, color: BRAND.ink, marginBottom: 10 }}>📌 {kit.notas}</div>}
        {kit.opcionales && (
          <div style={{ background: BRAND.blueSoft, border: `1px solid ${BRAND.blue}30`, borderRadius: R.md, padding: "9px 13px", fontSize: 12.5, color: BRAND.ink, marginBottom: 10 }}>
            ➕ Puede solicitar además: {kit.opcionales.map((t) => `${tipoDef(t).icon} ${tipoDef(t).label}`).join(" · ")}
          </div>
        )}

        {/* EPP entregado (amarrado a requisiciones) */}
        <div style={{ fontSize: 12, fontWeight: 800, color: BRAND.graphite, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>EPP asignado (entregado)</div>
        {!dot.tiene.length ? (
          <div style={{ background: BRAND.beigeLight, borderRadius: R.md, padding: 16, fontSize: 13, color: BRAND.stone, textAlign: "center" }}>Todavía no se le ha entregado ningún EPP.</div>
        ) : (
          <div style={{ background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.md, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: BRAND.beigeLight }}><th style={th}>Tipo</th><th style={th}>Código</th><th style={th}>Ítem</th><th style={{ ...th, textAlign: "right" }}>Cant.</th><th style={th}>Últ. entrega</th><th style={th}>Requisición</th></tr></thead>
              <tbody>
                {dot.tiene.map((x, i) => (
                  <tr key={i}>
                    <td style={td}>{tipoDef(x.tipo).icon} {tipoDef(x.tipo).label}</td>
                    <td style={{ ...td, fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, color: BRAND.orange }}>{x.codigo || "—"}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{x.nombre}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{x.qty}</td>
                    <td style={td}>{fmtDate(x.lastDate)}</td>
                    <td style={{ ...td, fontFamily: FONT.mono, fontSize: 11.5, color: BRAND.orange, fontWeight: 700 }}>{x.reqs.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!!dot.pend.length && (
          <div style={{ marginTop: 12, background: BRAND.blueSoft, border: `1px solid ${BRAND.blue}30`, borderRadius: R.md, padding: "10px 14px", fontSize: 12.5, color: BRAND.ink }}>
            🚚 En trámite (aprobado, aún sin entregar): {dot.pend.map((x) => `${x.codigo ? "#" + x.codigo + " " : ""}${x.nombre} (${x.qty})`).join(" · ")}
          </div>
        )}
      </Modal>
    );
  };

  // ══════════════════════════ INVENTARIO ══════════════════════════
  const renderInventario = () => {
    const sorted = [...items]
      .filter((it) => !fInvQ || norm(it.nombre).includes(norm(fInvQ)) || norm(it.codigo).includes(norm(fInvQ)) || norm(it.descripcion).includes(norm(fInvQ)))
      .sort((a, b) => String(a.categoria).localeCompare(b.categoria) || String(a.nombre).localeCompare(b.nombre));
    const valorTotal = items.reduce((s, i) => s + (Number(i.precio) || 0) * (Number(i.stock) || 0), 0);
    const sinCodigo = items.filter((it) => !String(it.codigo || "").trim());
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div style={{ flex: "1 1 280px", minWidth: 220 }}>
            <Input label="Buscar en inventario" placeholder="Nombre o código…" value={fInvQ} onChange={(e) => setFInvQ(e.target.value)} />
            <div style={{ fontSize: 12, color: BRAND.graphite, marginTop: 6 }}>{fInvQ ? `${sorted.length} de ${items.length}` : `${items.length}`} ítems · Valor del inventario: <b style={{ color: GREEN }}>{fmtL(valorTotal)}</b>{sinCodigo.length ? <span style={{ color: "#B45309" }}> · {sinCodigo.length} sin código</span> : null}</div>
          </div>
          {canManage && <Btn onClick={() => setModal({ t: "item" })}>+ Nuevo ítem</Btn>}
        </div>
        <div style={{ background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.lg, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: BRAND.beigeLight }}><th style={th}>Código</th><th style={th}>Ítem</th><th style={th}>Tipo</th><th style={th}>Categoría</th><th style={th}>Proveedor</th><th style={{ ...th, textAlign: "right" }}>Precio</th><th style={{ ...th, textAlign: "right" }}>Stock</th><th style={{ ...th, textAlign: "right" }}>Mín.</th>{canManage && <th style={{ ...th, textAlign: "right" }}>Acciones</th>}</tr></thead>
              <tbody>
                {sorted.map((it) => {
                  const sinStock = (Number(it.stock) || 0) <= 0; const bajo = (Number(it.stock) || 0) <= (Number(it.minStock) || 0);
                  return (
                    <tr key={it.id} style={{ background: sinStock ? BRAND.redSoft : bajo ? BRAND.yellowSoft : "transparent" }}>
                      <td style={{ ...td, fontFamily: FONT.mono, fontSize: 11.5, fontWeight: 700, color: it.codigo ? BRAND.orange : BRAND.ash }}>{it.codigo || "—"}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{it.nombre}</td>
                      <td style={td}>{tipoDef(tipoDeItem(it)).icon} {tipoDef(tipoDeItem(it)).label}</td>
                      <td style={td}>{catLabel(it.categoria)}</td>
                      <td style={td}>{provName(it.proveedorId)}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700, color: GREEN }}>{fmtL(it.precio)}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 800, color: sinStock ? BRAND.red : bajo ? "#B45309" : BRAND.charcoal }}>{Number(it.stock) || 0}{bajo && " ⚠"}</td>
                      <td style={{ ...td, textAlign: "right", color: BRAND.stone }}>{Number(it.minStock) || 0}</td>
                      {canManage && <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}><Btn small variant="ghost" onClick={() => setModal({ t: "item", item: it })}>✏️</Btn>{" "}<Btn small variant="ghost" style={{ color: BRAND.red }} onClick={async () => { if (!confirm(`¿Borrar "${it.nombre}" del catálogo?`)) return; await sItems(items.filter((x) => x.id !== it.id)); }}>🗑</Btn></td>}
                    </tr>
                  );
                })}
                {!items.length && <tr><td style={{ ...td, textAlign: "center", color: BRAND.stone, padding: 30 }} colSpan={canManage ? 9 : 8}>Sin ítems. Agregalos con "+ Nuevo ítem".</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // (El form de ítem vive a nivel de módulo — ItemFormImpl — para que los
  //  re-renders del padre NO lo desmonten y borren lo tecleado al subir foto.)

  // ══════════════════════════ PROVEEDORES ══════════════════════════
  const renderProveedores = () => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 13, color: BRAND.graphite }}>{providers.length} proveedor(es) de EPP</div>
        {canManage && (
          <div style={{ display: "flex", gap: 8 }}>
            {!providers.length && <Btn variant="info" onClick={async () => { if (!confirm("¿Cargar los 6 proveedores iniciales?\n\n" + PROV_SEED.join(" · "))) return; await sProv(PROV_SEED.map((n) => ({ id: uid(), nombre: n, contacto: "", telefono: "", correo: "", notas: "" }))); }}>⚡ Cargar los 6 proveedores</Btn>}
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
                {canManage && <div style={{ display: "flex", gap: 4 }}><Btn small variant="ghost" onClick={() => setModal({ t: "prov", prov: p })}>✏️</Btn><Btn small variant="ghost" style={{ color: BRAND.red }} onClick={async () => { if (nItems && !confirm(`"${p.nombre}" tiene ${nItems} ítem(s) que quedarían sin proveedor.\n\n¿Borrar igual?`)) return; if (!nItems && !confirm(`¿Borrar al proveedor "${p.nombre}"?`)) return; await sProv(providers.filter((x) => x.id !== p.id)); }}>🗑</Btn></div>}
              </div>
              <div style={{ fontSize: 12.5, color: BRAND.graphite, marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
                {p.contacto && <div>👤 {p.contacto}</div>}{p.telefono && <div>📞 {p.telefono}</div>}{p.correo && <div>✉️ {p.correo}</div>}{p.notas && <div style={{ color: BRAND.stone }}>{p.notas}</div>}
              </div>
              <div style={{ marginTop: 10 }}><Chip color={BRAND.orange} bg={BRAND.orangeBg}>{nItems} ÍTEM(S) EN CATÁLOGO</Chip></div>
            </div>
          );
        })}
        {!providers.length && <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 50, color: BRAND.stone, background: "#fff", borderRadius: R.lg, border: `1px dashed ${BRAND.border}` }}>Sin proveedores. {canManage ? "Usá \"⚡ Cargar los 6 proveedores\"." : ""}</div>}
      </div>
    </div>
  );

  // (ProvFormImpl vive a nivel de módulo por la misma razón que ItemFormImpl.)

  // ══════════════════════════ DESCUENTOS ══════════════════════════
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
        <div style={{ background: BRAND.redSoft, border: `1px solid ${BRAND.red}30`, borderRadius: R.md, padding: "10px 14px", fontSize: 12.5, color: BRAND.ink, marginBottom: 14 }}>⚠ Cada EPP solicitado por <b>pérdida/extravío</b> aparece acá para <b>deducirse de la planilla</b> del colaborador. Cuando tesorería lo aplique, se marca "Deducido".</div>
        <div style={{ background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.lg, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: BRAND.beigeLight }}><th style={th}>Fecha</th><th style={th}>Colaborador</th><th style={th}>Ítem perdido</th><th style={th}>Requisición</th><th style={{ ...th, textAlign: "right" }}>Cant.</th><th style={{ ...th, textAlign: "right" }}>A deducir</th><th style={th}>Estado</th>{canDeduct && <th style={{ ...th, textAlign: "right" }}>Acción</th>}</tr></thead>
              <tbody>
                {perdidas.map(({ req, linea, idx }) => (
                  <tr key={req.id + "-" + idx} style={{ background: linea.deducido ? "transparent" : BRAND.redSoft }}>
                    <td style={td}>{fmtDate(req.fecha)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{linea.paraNombre} <span style={{ fontSize: 10, color: BRAND.stone, fontWeight: 700 }}>{linea.paraEmpresa ? coTag(linea.paraEmpresa) : ""}</span></td>
                    <td style={td}>{tipoDef(tipoDeLinea(linea)).icon} {linea.nombre}{(linea.codigo || itemById(linea.itemId)?.codigo) ? <span style={{ fontFamily: FONT.mono, fontSize: 10.5, color: BRAND.orange, fontWeight: 700 }}> #{linea.codigo || itemById(linea.itemId)?.codigo}</span> : null}</td>
                    <td style={{ ...td, fontFamily: FONT.mono, fontWeight: 700, color: BRAND.orange }}>{req.numero}</td>
                    <td style={{ ...td, textAlign: "right" }}>{linea.qty}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 800, color: BRAND.red }}>{fmtL(linea.precio * linea.qty)}</td>
                    <td style={td}>{linea.deducido ? <Chip color={GREEN} bg={BRAND.greenSoft}>DEDUCIDO ✓{linea.deducidoPor ? ` · ${linea.deducidoPor}` : ""}</Chip> : <Chip color={BRAND.red} bg={BRAND.redSoft}>PENDIENTE</Chip>}</td>
                    {canDeduct && <td style={{ ...td, textAlign: "right" }}><Btn small variant={linea.deducido ? "ghost" : "success"} onClick={() => { if (!linea.deducido && !confirm(`¿Marcar como DEDUCIDO en planilla?\n\n${linea.paraNombre} — ${linea.nombre} (${fmtL(linea.precio * linea.qty)})`)) return; toggleDeducido(req.id, idx); }}>{linea.deducido ? "↩ Revertir" : "✓ Deducido"}</Btn></td>}
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
    { id: "dotacion", label: "👷 Dotación" },
    { id: "inventario", label: "📦 Inventario" },
    { id: "proveedores", label: "🏪 Proveedores" },
    { id: "descuentos", label: "⚠️ Descuentos planilla", badge: perdidasPend.length, badgeColor: BRAND.red },
  ];

  return (
    <div style={{ minHeight: "100vh", background: BRAND.beige, fontFamily: FONT.body, display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#fff", borderBottom: `1px solid ${BRAND.border}`, padding: "14px 26px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: R.md, background: "#B45309", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21 }}>🦺</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: BRAND.charcoal, fontFamily: FONT.display }}>GeoSafety</div>
            <div style={{ fontSize: 11.5, color: BRAND.stone }}>EPP · Catálogo, dotación y requisiciones — Grupo Geotecnica</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!readOnly && <Btn variant={cartUnits ? "primary" : "ghost"} onClick={() => setModal({ t: "cart" })}>🛒 Carrito{cartUnits ? ` (${cartUnits})` : ""}</Btn>}
          <span style={{ fontSize: 12.5, color: BRAND.graphite, fontWeight: 600 }}>{userName}</span>
          <Btn variant="ghost" onClick={onBack}>← Módulos</Btn>
          <Btn variant="ghost" onClick={onLogout}>Salir</Btn>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, padding: "14px 26px 0", flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setSec(t.id)} style={{ padding: "9px 16px", borderRadius: `${R.md}px ${R.md}px 0 0`, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT.body, borderTop: `1px solid ${sec === t.id ? BRAND.border : "transparent"}`, borderLeft: `1px solid ${sec === t.id ? BRAND.border : "transparent"}`, borderRight: `1px solid ${sec === t.id ? BRAND.border : "transparent"}`, borderBottom: "none", background: sec === t.id ? "#fff" : "transparent", color: sec === t.id ? BRAND.orange : BRAND.graphite }}>
            {t.label}{t.badge ? <span style={{ marginLeft: 6, background: t.badgeColor || BRAND.orange, color: "#fff", borderRadius: R.full, padding: "1px 7px", fontSize: 10.5, fontWeight: 800 }}>{t.badge}</span> : null}
          </button>
        ))}
      </div>

      <div style={{ padding: "20px 26px 40px", maxWidth: 1280, margin: "0 auto", width: "100%", boxSizing: "border-box", flex: 1 }}>
        {!loaded ? <div style={{ textAlign: "center", padding: 60, color: BRAND.stone }}>Cargando GeoSafety…</div> : (
          <>
            {sec === "catalogo" && renderCatalogo()}
            {sec === "requisiciones" && renderRequisiciones()}
            {sec === "dotacion" && renderDotacion()}
            {sec === "inventario" && renderInventario()}
            {sec === "proveedores" && renderProveedores()}
            {sec === "descuentos" && renderDescuentos()}
          </>
        )}
      </div>

      {/* Footer de créditos */}
      <div style={{ textAlign: "center", padding: "16px 20px 22px", fontSize: 11.5, color: BRAND.ash, borderTop: `1px solid ${BRAND.borderSoft}` }}>
        Lic. Gerson &nbsp;&amp;&nbsp; Ing. Nanu &nbsp;·&nbsp; <b style={{ color: BRAND.stone }}>GAIB Services</b>
      </div>

      {/* CartModal/FichaModal se renderizan como LLAMADA (no <JSX/>) a propósito:
          son helpers sin hooks y así React no los desmonta en cada re-render
          del padre (el input de cantidad del carrito perdería el foco). */}
      {modal?.t === "cart" && CartModal()}
      {modal?.t === "item" && (
        <Modal title={modal.item ? "Editar ítem" : "Nuevo ítem de EPP"} onClose={() => setModal(null)}>
          <ItemFormImpl item={modal.item} providers={providers} photoCache={photoCache} setPhotoCache={setPhotoCache}
            onCancel={() => setModal(null)}
            onSave={async (rec) => { const ok = await sItems(modal.item ? items.map((x) => (x.id === rec.id ? rec : x)) : [...items, rec]); if (ok) setModal(null); }} />
        </Modal>
      )}
      {modal?.t === "prov" && (
        <Modal title={modal.prov ? "Editar proveedor" : "Nuevo proveedor"} onClose={() => setModal(null)} width={520}>
          <ProvFormImpl prov={modal.prov}
            onCancel={() => setModal(null)}
            onSave={async (rec) => { const ok = await sProv(modal.prov ? providers.map((x) => (x.id === rec.id ? rec : x)) : [...providers, rec]); if (ok) setModal(null); }} />
        </Modal>
      )}
      {modal?.t === "jornal" && (
        <Modal title={modal.jorn ? "Editar personal jornal" : "Nuevo personal jornal"} onClose={() => setModal(null)} width={600}>
          <JornalFormImpl jorn={modal.jorn}
            onCancel={() => setModal(null)}
            onSave={async (rec) => {
              const ok = await sJorn(modal.jorn ? jornaleros.map((x) => (x.id === rec.id ? rec : x)) : [...jornaleros, rec]);
              if (!ok) return;
              // El puesto elegido manda: se guarda tambien como override para
              // que la ficha y los KPIs no dependan de la inferencia.
              await sPuestos({ [rec.id]: rec.puesto });
              setModal(null); setSec("dotacion");
            }} />
        </Modal>
      )}
      {modal?.t === "ficha" && FichaModal({ empId: modal.empId })}
    </div>
  );
}
