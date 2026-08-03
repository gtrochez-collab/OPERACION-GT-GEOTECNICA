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

import { useState, useEffect, useMemo, Fragment } from "react";
import { store } from "./supabase.js";
import { BRAND, FONT, R } from "./theme.js";
import { resolveShort, PROJECTS } from "./projects.js";

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
      {/* Talla: solo aplica a camisas de trabajo y burros con cubo (botas) —
          cada talla es un item distinto en el inventario (pedido 30-jul-2026). */}
      {(f.tipoEpp === "camisa" || f.tipoEpp === "botas") && (
        <div style={{ gridColumn: "1/-1", display: "grid", gridTemplateColumns: "200px 1fr", gap: 14, alignItems: "end" }}>
          <Input label={`Talla (${f.tipoEpp === "camisa" ? "S / M / L / XL / 2XL" : "número, ej: 39, 42"})`} placeholder={f.tipoEpp === "camisa" ? "Ej: XL" : "Ej: 42"} value={f.talla || ""} onChange={(e) => u("talla", e.target.value)} style={{ textTransform: "uppercase" }} />
          <div style={{ fontSize: 11.5, color: BRAND.stone, paddingBottom: 9 }}>Cada talla se maneja como su propio ítem con su stock (ej: "Bota Hule #39" y "Bota Hule #42" separadas).</div>
        </div>
      )}
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
          onSave({ ...f, codigo: String(f.codigo || "").trim().toUpperCase(), talla: (f.tipoEpp === "camisa" || f.tipoEpp === "botas") ? String(f.talla || "").trim().toUpperCase() : "", precio: Number(f.precio), stock: Number(f.stock) || 0, minStock: Number(f.minStock) || 0, id: f.id || uid() });
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

// ── Editor de requisición ya enviada (solo admins: Gerson y Daniel) ──
// Permite corregir cantidades, destinatario y motivo, o quitar líneas,
// sin tener que rechazar y re-hacer la requisición. Vive a nivel de módulo
// (regla anti-remount).
const EditReqFormImpl = ({ req, people, projOptions = [], onSave, onCancel }) => {
  const [lines, setLines] = useState(() => (req.lineas || []).map((l) => ({ ...l, _k: uid(), _origPara: l.paraEmpId, _origMotivo: l.motivo })));
  const upd = (k, patch) => setLines((ls) => ls.map((l) => (l._k === k ? { ...l, ...patch } : l)));
  const activos = people.filter((e) => e.status === "active").sort((a, b) => String(a.fullName).localeCompare(b.fullName));
  const total = lines.reduce((s, l) => s + (Number(l.precio) || 0) * (Number(l.qty) || 0), 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: BRAND.yellowSoft, border: `1px solid ${BRAND.yellow}50`, borderRadius: R.md, padding: "9px 13px", fontSize: 12.5, color: "#8a6d0b" }}>
        ✏️ Editando <b>{req.numero}</b> — podés corregir cantidades, para quién va, el motivo, o quitar líneas. El cambio queda registrado con tu nombre.
      </div>
      {lines.map((l) => (
        <div key={l._k} style={{ background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.md, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: BRAND.charcoal }}>
              {l.codigo && <span style={{ fontFamily: FONT.mono, color: BRAND.orange, marginRight: 6 }}>#{l.codigo}</span>}
              {l.nombre}{l.talla ? <span style={{ color: "#0F766E" }}> · Talla {l.talla}</span> : null}
              <span style={{ fontWeight: 600, color: GREEN }}> · {fmtL(l.precio)}</span>
            </div>
            <button onClick={() => setLines((ls) => ls.filter((x) => x._k !== l._k))} style={{ background: "none", border: "none", color: BRAND.red, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Quitar línea</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr 1fr", gap: 10 }}>
            <Input label="Cant." type="number" min="1" value={l.qty} onChange={(e) => upd(l._k, { qty: e.target.value })} />
            <Select label="Para (colaborador)" placeholder="— Seleccionar —" value={l.paraEmpId} onChange={(e) => upd(l._k, { paraEmpId: e.target.value })}
              options={[
                // Si el asignado actual ya no esta activo (baja / jornalero
                // borrado), igual se muestra para no parecer "sin asignar".
                ...(l.paraEmpId && !activos.some((e) => e.id === l.paraEmpId) ? [{ value: l.paraEmpId, label: `${l.paraNombre || "?"} (ya no activo)` }] : []),
                ...activos.map((e) => ({ value: e.id, label: `${e.fullName} · ${e.esJornal || e.company === "jornal" ? "JORNAL" : coTag(e.company)}` })),
              ]} />
            <Select label="Motivo" placeholder="— Seleccionar —" value={l.motivo} onChange={(e) => upd(l._k, { motivo: e.target.value })}
              options={MOTIVOS.map((m) => ({ value: m.value, label: m.label }))} />
            <Select label="Proyecto" placeholder="— Proyecto —" value={l.proyecto || ""} onChange={(e) => upd(l._k, { proyecto: e.target.value })}
              options={[
                // Proyecto legacy que ya no este en la lista: se muestra igual.
                ...(l.proyecto && !projOptions.some((o) => o.value === l.proyecto) ? [{ value: l.proyecto, label: l.proyecto }] : []),
                ...projOptions,
              ]} />
          </div>
        </div>
      ))}
      {!lines.length && <div style={{ textAlign: "center", padding: 20, color: BRAND.stone, fontSize: 13 }}>Sin líneas — guardar así ELIMINA todos los ítems de la requisición.</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: BRAND.charcoal }}>Total: <span style={{ color: GREEN }}>{fmtL(total)}</span></div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="ghost" onClick={onCancel}>Cancelar</Btn>
          <Btn variant="success" onClick={() => {
            for (const l of lines) {
              if (!Number(l.qty) || Number(l.qty) < 1) return alert(`Cantidad inválida en "${l.nombre}".`);
              if (!l.paraEmpId) return alert(`Falta el colaborador de "${l.nombre}".`);
              if (!l.motivo) return alert(`Falta el motivo de "${l.nombre}".`);
            }
            if (!lines.length && !confirm("Vas a guardar la requisición SIN LÍNEAS. ¿Seguro?")) return;
            let resetDeducido = 0;
            const lineas = lines.map(({ _k, _origPara, _origMotivo, ...l }) => {
              const p = people.find((e) => e.id === l.paraEmpId);
              const out = { ...l, qty: Number(l.qty), paraNombre: p?.fullName || l.paraNombre, paraEmpresa: p ? (p.esJornal ? "jornal" : p.company) : l.paraEmpresa };
              // Si cambio el colaborador o el motivo de una linea que YA
              // estaba deducida en planilla, la marca se resetea (la
              // deduccion aplicada fue a OTRA persona / otro motivo).
              if (l.deducido && (l.paraEmpId !== _origPara || l.motivo !== _origMotivo)) {
                out.deducido = false; delete out.deducidoPor; delete out.deducidoAt; resetDeducido++;
              }
              return out;
            });
            if (resetDeducido && !confirm(`⚠ ${resetDeducido} línea(s) de pérdida ya estaban marcadas DEDUCIDAS y les cambiaste el colaborador o el motivo.\n\nLa marca de "deducido" se va a RESETEAR (tesorería deberá volver a aplicarla). ¿Continuar?`)) return;
            onSave(lineas);
          }}>Guardar cambios</Btn>
        </div>
      </div>
    </div>
  );
};

// ── Creador de orden "Por comprar" (PO) desde cero ──
// Para pedidos grandes que no nacen de una requisición: se buscan ítems del
// inventario (el código ya viene amarrado a su proveedor) y se arma la orden.
const PoFormImpl = ({ items, providers, onSave, onCancel }) => {
  const [q, setQ] = useState("");
  const [lines, setLines] = useState([]); // [{_k, itemId, cant}]
  const provName = (id) => providers.find((p) => p.id === id)?.nombre || "—";
  const nq = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const results = q.trim()
    ? items.filter((it) => (nq(it.nombre).includes(nq(q)) || nq(it.codigo).includes(nq(q))) && !lines.some((l) => l.itemId === it.id)).slice(0, 8)
    : [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Input label="Buscar ítem del inventario (nombre o código)" placeholder="Ej: bota, WE21-3113G, camisa…" value={q} onChange={(e) => setQ(e.target.value)} />
      {!!results.length && (
        <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: R.md, overflow: "hidden" }}>
          {results.map((it) => (
            <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: `1px solid ${BRAND.borderSoft}`, background: "#fff" }}>
              <div style={{ fontSize: 12.5, minWidth: 0 }}>
                <b>{it.nombre}</b>{it.talla ? <span style={{ color: "#0F766E", fontWeight: 700 }}> · Talla {it.talla}</span> : null}
                <div style={{ fontSize: 11, color: BRAND.stone }}>{it.codigo ? <span style={{ fontFamily: FONT.mono, color: BRAND.orange, fontWeight: 700 }}>#{it.codigo}</span> : "sin código"} · 🏪 {provName(it.proveedorId)} · stock {Number(it.stock) || 0}</div>
              </div>
              <Btn small onClick={() => { setLines((ls) => [...ls, { _k: uid(), itemId: it.id, cant: 1 }]); setQ(""); }}>＋ Agregar</Btn>
            </div>
          ))}
        </div>
      )}
      {!!lines.length && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {lines.map((l) => {
            const it = items.find((i) => i.id === l.itemId) || {};
            return (
              <div key={l._k} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.md, padding: "8px 12px" }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>
                  <b>{it.nombre}</b>{it.talla ? <span style={{ color: "#0F766E", fontWeight: 700 }}> · Talla {it.talla}</span> : null}
                  <span style={{ fontSize: 11, color: BRAND.stone }}> · {it.codigo ? `#${it.codigo}` : "sin código"} · {provName(it.proveedorId)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 11, color: BRAND.graphite }}>Cant.</span>
                  <input value={l.cant} onChange={(e) => { const v = e.target.value; if (/^\d{0,4}$/.test(v)) setLines((ls) => ls.map((x) => (x._k === l._k ? { ...x, cant: v } : x))); }} style={{ width: 60, padding: "6px 8px", border: `1px solid ${BRAND.border}`, borderRadius: R.sm, fontSize: 13, textAlign: "center" }} />
                </div>
                <button onClick={() => setLines((ls) => ls.filter((x) => x._k !== l._k))} style={{ background: "none", border: "none", color: BRAND.red, cursor: "pointer", fontWeight: 800, fontSize: 15 }}>×</button>
              </div>
            );
          })}
        </div>
      )}
      {!lines.length && <div style={{ textAlign: "center", padding: 18, color: BRAND.stone, fontSize: 12.5, background: BRAND.beigeLight, borderRadius: R.md }}>Buscá ítems arriba y agregalos a la orden. El PDF sale agrupado por proveedor.</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Btn variant="ghost" onClick={onCancel}>Cancelar</Btn>
        <Btn variant="success" onClick={() => {
          if (!lines.length) return alert("Agregá al menos un ítem.");
          for (const l of lines) { if (!Number(l.cant) || Number(l.cant) < 1) return alert("Hay cantidades inválidas."); }
          onSave(lines.map((l) => {
            const it = items.find((i) => i.id === l.itemId) || {};
            return { itemId: l.itemId, codigo: it.codigo || "", nombre: it.nombre || "?", talla: it.talla || "", proveedorId: it.proveedorId || "", cant: Number(l.cant) };
          }));
        }}>Crear orden</Btn>
      </div>
    </div>
  );
};

// ── Recepcion de PO: cantidades y PRECIOS REALES ──
// Al marcar una orden "Recibida" se abre este form para registrar lo que
// REALMENTE llego y a que precio (los precios cambian mes a mes y al comprar
// por mayor). Este es el cierre financiero veridico de la compra:
//   - El total real queda guardado en la PO (auditable en Costos).
//   - Las cantidades recibidas ENTRAN al stock del almacen (opcional).
//   - El precio del catalogo se actualiza al precio real (opcional).
const PoReciboFormImpl = ({ po, items, onSave, onCancel }) => {
  const [lines, setLines] = useState(() => (po.lines || []).map((l, i) => {
    const it = items.find((x) => x.id === l.itemId);
    return { ...l, _k: `${i}`, cantRecibida: String(l.cant ?? ""), precioReal: String(Number(it?.precio) || "") };
  }));
  const [sumarStock, setSumarStock] = useState(true);
  const [actualizarPrecios, setActualizarPrecios] = useState(true);
  const upd = (k, patch) => setLines((ls) => ls.map((l) => (l._k === k ? { ...l, ...patch } : l)));
  const totalReal = lines.reduce((s, l) => s + (Number(l.precioReal) || 0) * (Number(l.cantRecibida) || 0), 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: BRAND.greenSoft, border: `1px solid ${BRAND.green}40`, borderRadius: R.md, padding: "9px 13px", fontSize: 12.5, color: "#3D5F35" }}>
        📦 Registrá lo que <b>realmente llegó</b> y el <b>precio real</b> de esta compra (según factura del proveedor). Con esto queda el costo verídico de la orden y las unidades entran al almacén.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {lines.map((l) => (
          <div key={l._k} style={{ background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.md, padding: "10px 12px" }}>
            <div style={{ fontWeight: 800, fontSize: 12.5, color: BRAND.charcoal, marginBottom: 6 }}>
              {l.codigo && <span style={{ fontFamily: FONT.mono, color: BRAND.orange, marginRight: 6 }}>#{l.codigo}</span>}
              {l.nombre}{l.talla ? <span style={{ color: "#0F766E" }}> · Talla {l.talla}</span> : null}
              {l.proyecto ? <Chip color={BRAND.orange} bg="rgba(232,118,45,0.10)" style={{ marginLeft: 6 }}>{l.proyecto}</Chip> : null}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "90px 110px 130px 1fr", gap: 10, alignItems: "end" }}>
              <Field label="Pedido"><div style={{ padding: "8px 10px", fontSize: 13, fontWeight: 800, color: BRAND.graphite }}>{l.cant}</div></Field>
              <Input label="Recibido" type="number" min="0" value={l.cantRecibida} onChange={(e) => upd(l._k, { cantRecibida: e.target.value })} />
              <Input label="Precio real (L)" type="number" min="0" step="0.01" value={l.precioReal} onChange={(e) => upd(l._k, { precioReal: e.target.value })} />
              <div style={{ textAlign: "right", fontSize: 13.5, fontWeight: 800, color: GREEN, paddingBottom: 9 }}>{fmtL((Number(l.precioReal) || 0) * (Number(l.cantRecibida) || 0))}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, background: BRAND.beigeLight, borderRadius: R.md, padding: "10px 13px" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700, color: BRAND.charcoal, cursor: "pointer" }}>
          <input type="checkbox" checked={sumarStock} onChange={(e) => setSumarStock(e.target.checked)} />
          Sumar las cantidades recibidas al stock del almacén (Inventario)
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700, color: BRAND.charcoal, cursor: "pointer" }}>
          <input type="checkbox" checked={actualizarPrecios} onChange={(e) => setActualizarPrecios(e.target.checked)} />
          Actualizar el precio del catálogo con el precio real
        </label>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: BRAND.charcoal }}>Total real: <span style={{ color: GREEN }}>{fmtL(totalReal)}</span></div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="ghost" onClick={onCancel}>Cancelar</Btn>
          <Btn variant="success" onClick={() => {
            for (const l of lines) {
              if (l.cantRecibida === "" || Number(l.cantRecibida) < 0) return alert(`Cantidad recibida inválida en "${l.nombre}".`);
              if (l.precioReal === "" || Number(l.precioReal) < 0) return alert(`Precio real inválido en "${l.nombre}". Si fue gratis poné 0.`);
            }
            onSave(
              lines.map(({ _k, ...l }) => ({ ...l, cantRecibida: Number(l.cantRecibida), precioReal: Number(l.precioReal) })),
              { sumarStock, actualizarPrecios },
            );
          }}>✓ Confirmar recepción</Btn>
        </div>
      </div>
    </div>
  );
};

// ── Paisaje decorativo GeoSafety ──
// Un proyecto en miniatura estilo LEGO: la BG-20 perforando y el equipo con
// su EPP puesto (ingeniero, operador, ayudante, mecánico y soldador). Se
// muestra al pie de TODOS los apartados del módulo. Solo decorativo.
const GeoSafetyScene = () => {
  const SKIN = "#E9C6A0";
  const Cara = ({ x, y }) => (<g><circle cx={x - 3} cy={y} r="1.3" fill="#3B2F25" /><circle cx={x + 3} cy={y} r="1.3" fill="#3B2F25" /><path d={`M ${x - 3} ${y + 4} Q ${x} ${y + 6.5} ${x + 3} ${y + 4}`} stroke="#B5836A" strokeWidth="1.2" fill="none" strokeLinecap="round" /></g>);
  const Casco = ({ x, y, c }) => (<g><path d={`M ${x - 10} ${y} a10,9 0 0 1 20,0 Z`} fill={c} stroke="rgba(0,0,0,0.25)" /><rect x={x - 12.5} y={y - 1} width="25" height="3.5" rx="1.7" fill={c} stroke="rgba(0,0,0,0.25)" /><rect x={x - 2} y={y - 12} width="4" height="4.5" rx="1.5" fill={c} stroke="rgba(0,0,0,0.2)" /></g>);
  const Piernas = ({ x, y }) => (<g><rect x={x - 8} y={y} width="7" height="16" rx="2" fill="#3E5578" /><rect x={x + 1} y={y} width="7" height="16" rx="2" fill="#3E5578" /><rect x={x - 10} y={y + 15} width="10" height="5" rx="2" fill="#6B4423" /><rect x={x} y={y + 15} width="10" height="5" rx="2" fill="#6B4423" /></g>);
  return (
    <div aria-hidden="true" style={{ width: "100%", overflow: "hidden", lineHeight: 0, background: "linear-gradient(#FFFBF500, #F5EFE3)" }}>
      <svg viewBox="0 0 1200 175" width="100%" style={{ display: "block", minHeight: 120, maxHeight: 175 }} preserveAspectRatio="xMidYMax meet">
        {/* sol y nubes */}
        <circle cx="1080" cy="38" r="20" fill="#F5C97E" opacity="0.55" />
        <g fill="#EFE7D6" opacity="0.9"><ellipse cx="240" cy="34" rx="34" ry="11" /><ellipse cx="268" cy="27" rx="22" ry="9" /><ellipse cx="880" cy="30" rx="30" ry="10" /><ellipse cx="905" cy="24" rx="18" ry="8" /></g>
        {/* suelo */}
        <rect x="0" y="148" width="1200" height="27" fill="#EDE5D5" />
        <line x1="0" y1="148" x2="1200" y2="148" stroke="#DBD4C8" strokeWidth="1.5" />
        <g fill="#DBD4C8"><ellipse cx="90" cy="158" rx="9" ry="2.5" /><ellipse cx="410" cy="162" rx="12" ry="3" /><ellipse cx="700" cy="159" rx="8" ry="2.5" /><ellipse cx="1050" cy="161" rx="11" ry="3" /></g>

        {/* ── BG-20 perforando ── */}
        <g>
          {/* mastil */}
          <rect x="216" y="12" width="13" height="126" rx="3" fill="#2C2A28" />
          <g stroke="#4A443E" strokeWidth="1.5">{[24, 40, 56, 72, 88, 104, 120].map((y) => <line key={y} x1="216" y1={y} x2="229" y2={y + 9} />)}</g>
          <circle cx="222" cy="12" r="6" fill="#C75F1F" stroke="#8F4415" />
          <line x1="222" y1="16" x2="222" y2="98" stroke="#5C5853" strokeWidth="2" />
          {/* cabezal + barra de perforacion */}
          <rect x="211" y="96" width="23" height="14" rx="3" fill="#E8762D" stroke="#B4551B" />
          <rect x="218.5" y="110" width="7" height="30" fill="#8B847C" />
          <path d="M 216 140 h 13 l -6.5 9 z" fill="#4A443E" />
          {/* polvo de perforacion */}
          <g fill="#DBD4C8" opacity="0.8"><ellipse cx="212" cy="146" rx="7" ry="3.5" /><ellipse cx="234" cy="145" rx="6" ry="3" /></g>
          {/* cuerpo + cabina */}
          <rect x="128" y="96" width="86" height="30" rx="6" fill="#E8762D" stroke="#B4551B" strokeWidth="1.5" />
          <rect x="136" y="76" width="34" height="26" rx="5" fill="#F1A263" stroke="#B4551B" />
          <rect x="141" y="81" width="17" height="13" rx="2.5" fill="#BFDBFE" stroke="#8FB4E3" />
          <text x="182" y="116" fontSize="12" fontWeight="800" fill="#fff" fontFamily="Arial, sans-serif">BG-20</text>
          {/* orugas */}
          <rect x="122" y="126" width="100" height="18" rx="9" fill="#3D3A37" />
          {[136, 154, 172, 190, 208].map((cx) => <circle key={cx} cx={cx} cy="135" r="5.5" fill="#6B655E" stroke="#2C2A28" />)}
        </g>

        {/* conos */}
        {[300, 760].map((cx) => (<g key={cx}><path d={`M ${cx} 128 l 7 20 h -14 z`} fill="#E8762D" /><rect x={cx - 9} y="146" width="18" height="3.5" rx="1.5" fill="#C75F1F" /><rect x={cx - 4.2} y="136" width="8.4" height="3.5" fill="#fff" /></g>))}

        {/* ── Ingeniero: casco blanco + chaleco khaki + tablet ── */}
        <g transform="translate(360,0)">
          <Piernas x={0} y={128} />
          <rect x="-11" y="100" width="22" height="30" rx="5" fill="#F7F4EE" stroke="#D8D2C6" />
          <rect x="-11" y="100" width="8" height="30" rx="3" fill="#C7B287" />
          <rect x="3" y="100" width="8" height="30" rx="3" fill="#C7B287" />
          <line x1="-13" y1="105" x2="-20" y2="120" stroke="#F7F4EE" strokeWidth="5.5" strokeLinecap="round" />
          <line x1="13" y1="105" x2="21" y2="118" stroke="#F7F4EE" strokeWidth="5.5" strokeLinecap="round" />
          <rect x="14" y="114" width="14" height="10" rx="2" fill="#2C5F5D" stroke="#1E4341" />
          <circle cx="0" cy="88" r="10.5" fill={SKIN} stroke="#C79A70" />
          <Cara x={0} y={87} />
          <Casco x={0} y={81} c="#F6F5F2" />
        </g>

        {/* ── Operador BG: casco anaranjado + polo negra, saludando ── */}
        <g transform="translate(275,0)">
          <Piernas x={0} y={128} />
          <rect x="-11" y="100" width="22" height="30" rx="5" fill="#28231F" />
          <rect x="-11" y="107" width="22" height="2.5" fill="#E8762D" />
          <rect x="-11" y="120" width="22" height="2.5" fill="#E8762D" />
          <line x1="-13" y1="106" x2="-22" y2="92" stroke="#28231F" strokeWidth="5.5" strokeLinecap="round" />
          <circle cx="-24" cy="89" r="4" fill={SKIN} />
          <line x1="13" y1="106" x2="20" y2="122" stroke="#28231F" strokeWidth="5.5" strokeLinecap="round" />
          <circle cx="0" cy="88" r="10.5" fill={SKIN} stroke="#C79A70" />
          <Cara x={0} y={87} />
          <Casco x={0} y={81} c="#E8762D" />
        </g>

        {/* ── Ayudante: casco amarillo + camisa anaranjada + pala ── */}
        <g transform="translate(480,0)">
          <Piernas x={0} y={128} />
          <rect x="-11" y="100" width="22" height="30" rx="5" fill="#E8762D" stroke="#B4551B" />
          <rect x="-11" y="112" width="22" height="2.5" fill="#26221F" />
          <line x1="-13" y1="106" x2="-19" y2="124" stroke="#E8762D" strokeWidth="5.5" strokeLinecap="round" />
          <line x1="13" y1="106" x2="17" y2="124" stroke="#E8762D" strokeWidth="5.5" strokeLinecap="round" />
          <line x1="20" y1="98" x2="20" y2="140" stroke="#8B5E34" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M 15 140 h 10 l -2 8 h -6 z" fill="#8B847C" stroke="#5C5853" />
          <circle cx="0" cy="88" r="10.5" fill={SKIN} stroke="#C79A70" />
          <Cara x={0} y={87} />
          <Casco x={0} y={81} c="#F2C40F" />
        </g>

        {/* ── Mecánico: casco azul + rayas + llave + caja ── */}
        <g transform="translate(620,0)">
          <Piernas x={0} y={128} />
          <rect x="-11" y="100" width="22" height="30" rx="5" fill="#E8762D" stroke="#B4551B" />
          <rect x="-11" y="106" width="22" height="4" fill="#26221F" />
          <rect x="-11" y="117" width="22" height="4" fill="#26221F" />
          <line x1="-13" y1="106" x2="-20" y2="121" stroke="#E8762D" strokeWidth="5.5" strokeLinecap="round" />
          <line x1="13" y1="106" x2="21" y2="115" stroke="#E8762D" strokeWidth="5.5" strokeLinecap="round" />
          <g transform="rotate(40 24 112)"><rect x="21.5" y="103" width="5" height="18" rx="2" fill="#8B959E" /><circle cx="24" cy="102" r="4.5" fill="none" stroke="#8B959E" strokeWidth="3" /></g>
          <circle cx="0" cy="88" r="10.5" fill={SKIN} stroke="#C79A70" />
          <Cara x={0} y={87} />
          <Casco x={0} y={81} c="#2F6FE0" />
          <rect x="-38" y="136" width="22" height="12" rx="2" fill="#B4551B" stroke="#8F4415" /><rect x="-33" y="132" width="12" height="4" rx="2" fill="#8F4415" />
        </g>

        {/* ── Soldador: careta + delantal, soldando una viga con chispas ── */}
        <g transform="translate(860,0)">
          <rect x="18" y="132" width="70" height="9" rx="2" fill="#8B959E" stroke="#5C6670" />
          <Piernas x={0} y={128} />
          <rect x="-11" y="100" width="22" height="30" rx="5" fill="#5C5853" />
          <path d="M -8 102 L 8 102 L 11 130 L -11 130 Z" fill="#7A6350" stroke="#5D4C3C" />
          <line x1="13" y1="106" x2="24" y2="120" stroke="#5C5853" strokeWidth="5.5" strokeLinecap="round" />
          <rect x="22" y="118" width="10" height="5" rx="2" fill="#3D3A37" transform="rotate(28 27 120)" />
          <g><path d="M 33 126 l 3 -6 M 37 128 l 5 -3 M 36 132 l 6 1" stroke="#F5A623" strokeWidth="2" strokeLinecap="round" /><circle cx="34" cy="128" r="2.5" fill="#FDE68A" /></g>
          <line x1="-13" y1="106" x2="-19" y2="122" stroke="#5C5853" strokeWidth="5.5" strokeLinecap="round" />
          <circle cx="0" cy="88" r="10.5" fill={SKIN} />
          <rect x="-9" y="78" width="18" height="20" rx="4" fill="#3A3F45" stroke="#23272E" />
          <rect x="-5.5" y="86" width="11" height="5" rx="1.5" fill="#14532D" stroke="#0B3B1E" />
        </g>

        {/* letrero */}
        <g transform="translate(1010,0)">
          <rect x="-2" y="104" width="4" height="44" fill="#8B5E34" />
          <rect x="-34" y="86" width="68" height="24" rx="4" fill="#2C2A28" />
          <text x="0" y="98" fontSize="8.5" fontWeight="800" fill="#E8762D" textAnchor="middle" fontFamily="Arial, sans-serif">GEOSAFETY</text>
          <text x="0" y="107" fontSize="6" fontWeight="600" fill="#DBD4C8" textAnchor="middle" fontFamily="Arial, sans-serif">SEGURIDAD PRIMERO</text>
        </g>
      </svg>
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
  const [reqOpen, setReqOpen] = useState(null); // requisición abierta en el tablero (vista detalle)
  const [fInvQ, setFInvQ] = useState("");   // busqueda en Inventario (nombre/codigo)
  const [fDotQ, setFDotQ] = useState("");
  const [fDotCo, setFDotCo] = useState("");
  const [fDotPuesto, setFDotPuesto] = useState("");
  const [fDotFalta, setFDotFalta] = useState(false); // solo con faltantes
  const [puestosMap, setPuestosMap] = useState({}); // ep-puestos: {empId: puestoKey} — overrides manuales
  // Ordenes "Por comprar" (PO): lo que falta en stock y se manda a cotizar
  // al proveedor. Key: ep-pos.
  const [pos, setPos] = useState([]);
  // Asignaciones empId→proyecto de la ULTIMA quincena registrada en la
  // asistencia de GeoTeam (hr-atts2, solo lectura) — para agrupar la
  // Dotacion por proyecto tal como esta distribuida la gente.
  const [attAssign, setAttAssign] = useState({});
  const [attAssignLabel, setAttAssignLabel] = useState("");
  // Proyectos custom de GeoShopping (cp-projects, solo lectura) — se mergean
  // con los base de projects.js para el dropdown de proyecto del carrito.
  const [cpProjects, setCpProjects] = useState([]);
  // Mes seleccionado en la pestaña Costos (formato YYYY-MM).
  const [costosMes, setCostosMes] = useState(new Date().toISOString().slice(0, 7));

  const canManage = ["admin", "costos", "almacenista"].includes(userRole);
  const canDeduct = canManage || userRole === "tesoreria";
  const readOnly = userRole === "gerencia";

  useEffect(() => {
    (async () => {
      const [pv, it, rq, em, pu, jr, po, at, cpp] = await Promise.all([
        store.get("ep-providers"), store.get("ep-items"), store.get("ep-reqs"), store.get("hr-emps5"), store.get("ep-puestos"), store.get("ep-jornaleros"), store.get("ep-pos"), store.get("hr-atts2"), store.get("cp-projects"),
      ]);
      setProviders(Array.isArray(pv) ? pv : []);
      setItems(Array.isArray(it) ? it : []);
      setReqs(Array.isArray(rq) ? rq : []);
      setEmps(Array.isArray(em) ? em : []);
      setPuestosMap(pu && typeof pu === "object" && !Array.isArray(pu) ? pu : {});
      setJornaleros(Array.isArray(jr) ? jr : []);
      setPos(Array.isArray(po) ? po : []);
      setCpProjects(Array.isArray(cpp) ? cpp : []);
      // Ultima quincena registrada POR EMPRESA en la asistencia de GeoTeam:
      // sus assignments dicen en que proyecto anda cada quien.
      if (Array.isArray(at) && at.length) {
        const latest = {};
        at.forEach((s) => {
          if (!s || !s.company) return;
          const score = `${s.periodo || ""}|${s.quincena || ""}`;
          if (!latest[s.company] || score > latest[s.company].score) latest[s.company] = { score, s };
        });
        // Normalizar shorts como lo hace GeoTeam (resolveShortHR): los shorts
        // de proyectos custom de compras GANAN sobre los aliases legacy —
        // caso PLANTEL. Sin esto, un alias viejo crearia grupos duplicados.
        const customs = new Set((Array.isArray(cpp) ? cpp : []).map((p) => p && p.short).filter(Boolean));
        const resolveS = (s) => (customs.has(s) ? s : resolveShort(s));
        const map = {};
        const labels = [];
        Object.values(latest).forEach(({ s }) => {
          labels.push(`${s.quincena} ${s.periodo}`);
          Object.entries(s.assignments || {}).forEach(([eid, short]) => { if (short) map[eid] = resolveS(String(short)); });
        });
        setAttAssign(map);
        setAttAssignLabel([...new Set(labels)].join(" · "));
      }
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
  const sPos = async (v) => { setPos(v); const ok = await store.set("ep-pos", v); if (!ok) alert("⚠ No se guardó en la nube (ep-pos)."); return ok; };
  // Crear una PO con MERGE contra la nube: dos admins creando ordenes casi a
  // la vez no se pisan, y el numero se calcula sobre la lista fresca.
  const crearPo = async (lines, fuente) => {
    let base = pos;
    try { const c = await store.getCloud("ep-pos"); if (Array.isArray(c)) base = c; } catch { /* nube caída: memoria */ }
    const num = "PO-" + String(base.reduce((m, p) => Math.max(m, parseInt(String(p.numero || "").replace(/\D/g, ""), 10) || 0), 0) + 1).padStart(3, "0");
    const po = { id: uid(), numero: num, fecha: new Date().toISOString(), estado: "pendiente", fuente: fuente || "", creadoPor: userName, lines };
    const next = [po, ...base];
    setPos(next);
    const ok = await store.set("ep-pos", next);
    if (!ok) { alert("⚠ No se guardó en la nube (ep-pos). Reintentá."); return null; }
    return po;
  };
  // Guardar una requisicion EDITADA: se toma la version FRESCA de la nube y
  // solo se le aplican las lineas editadas — el estado y sus metadatos
  // (entregadaPor, etc.) NO se pisan. Si otro admin la entrego/rechazo/borro
  // mientras el editor estaba abierto, se aborta con aviso (evita dobles
  // descuentos de stock y resucitar requisiciones eliminadas).
  const saveReqEdit = async (reqId, lineas) => {
    let base = reqs;
    try { const c = await store.getCloud("ep-reqs"); if (Array.isArray(c) && c.length) base = c; } catch { /* nube caída: memoria */ }
    const fresca = base.find((r) => r.id === reqId);
    if (!fresca) { alert("⚠ Esta requisición ya NO existe (otro usuario la eliminó). No se guardó nada."); return false; }
    if (fresca.estado !== "pendiente" && fresca.estado !== "aprobada") { alert(`⚠ Esta requisición ya está "${fresca.estado}" (otro usuario le cambió el estado). No se puede editar — recargá la página.`); return false; }
    const upd = { ...fresca, lineas, total: lineas.reduce((s, l) => s + (Number(l.precio) || 0) * l.qty, 0), editadoPor: userName, editadoAt: new Date().toISOString() };
    const next = base.map((r) => (r.id === reqId ? upd : r));
    setReqs(next);
    const ok = await store.set("ep-reqs", next);
    if (!ok) alert("⚠ No se guardó en la nube (ep-reqs). Reintentá.");
    return ok;
  };

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
  // Lista unificada de proyectos para el dropdown del carrito: base
  // (projects.js) + custom de GeoShopping (cp-projects, sin ocultos), sin
  // duplicados. Los shorts custom GANAN sobre los base (mismo criterio que
  // resolveShortHR en GeoTeam).
  const projOptions = useMemo(() => {
    const customs = (cpProjects || []).filter((p) => p && p.short && !p.hidden && !p.deleted);
    const customShorts = new Set(customs.map((p) => p.short));
    const base = PROJECTS.filter((p) => !customShorts.has(p.short) && !customShorts.has(resolveShort(p.short)));
    const all = [...customs, ...base].map((p) => ({ value: p.short, label: p.short }));
    return all.sort((a, b) => a.label.localeCompare(b.label));
  }, [cpProjects]);

  const addToCart = (item) => {
    setCart((c) => {
      const ex = c.find((l) => l.itemId === item.id);
      if (ex) return c.map((l) => (l === ex ? { ...l, dests: l.dests.map((d, i) => (i === 0 ? { ...d, qty: (Number(d.qty) || 0) + 1 } : d)) } : l));
      return [...c, { key: uid(), itemId: item.id, dests: [{ empId: "", qty: 1, motivo: "", proj: "" }] }];
    });
  };
  const cartUnits = cart.reduce((s, l) => s + l.dests.reduce((a, d) => a + (Number(d.qty) || 0), 0), 0);
  const cartTotal = cart.reduce((s, l) => s + (Number(itemById(l.itemId)?.precio) || 0) * l.dests.reduce((a, d) => a + (Number(d.qty) || 0), 0), 0);
  const lineUnits = (l) => l.dests.reduce((a, d) => a + (Number(d.qty) || 0), 0);
  const updDest = (lineKey, di, patch) => setCart((c) => c.map((l) => (l.key === lineKey ? { ...l, dests: l.dests.map((d, i) => (i === di ? { ...d, ...patch } : d)) } : l)));
  const addDest = (lineKey) => setCart((c) => c.map((l) => (l.key === lineKey ? { ...l, dests: [...l.dests, { empId: "", qty: 1, motivo: "", proj: "" }] } : l)));
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
        if (!d.proj) return alert(`Falta el PROYECTO de "${it.nombre}" (${empById(d.empId)?.fullName || "colaborador"}). Así el gasto queda cargado al proyecto correcto.`);
        const emp = empById(d.empId);
        if (!emp) return alert(`La persona asignada a "${it.nombre}" ya no existe (¿se borró?). Volvé a seleccionarla.`);
        lineas.push({ itemId: l.itemId, nombre: it.nombre, codigo: it.codigo || "", talla: it.talla || "", categoria: it.categoria, tipoEpp: tipoDeItem(it), proveedor: provName(it.proveedorId), precio: Number(it.precio) || 0, qty: Number(d.qty), paraEmpId: d.empId, paraNombre: emp.fullName || "—", paraEmpresa: emp.company || "", proyecto: d.proj, motivo: d.motivo, deducido: false });
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

  // NOTA (cambio de modelo, ago 2026): marcar una requisicion ENTREGADA ya
  // NO descuenta stock. Antes se descontaba automaticamente y eso registraba
  // salidas de items que nunca habian ENTRADO al almacen (se pedian directo
  // al proveedor y se repartian al instante). El stock ahora es:
  //   - ENTRADA: al marcar una PO "Recibida" (con cantidades/precios reales).
  //   - AJUSTE: manual desde Inventario (editar item).
  // La ficha de Dotacion NO cambia: sigue leyendo las requisiciones
  // entregadas (que EPP tiene cada colaborador), independiente del stock.
  const setEstadoReq = async (req, estado) => {
    const verbo = { aprobada: "APROBAR", rechazada: "RECHAZAR", entregada: "marcar ENTREGADA" }[estado];
    if (!confirm(`¿${verbo} la requisición ${req.numero}?` + (estado === "entregada" ? "\n\nEl EPP quedará asignado a cada colaborador en su ficha de dotación. (El stock del almacén NO se toca — las entradas reales se registran al recibir la orden Por Comprar.)" : ""))) return;
    const upd = reqs.map((r) => (r.id === req.id ? { ...r, estado, [estado + "Por"]: userName, [estado + "At"]: new Date().toISOString() } : r));
    await sReqs(upd);
  };
  // Marcar deducido con MERGE contra la nube y verificacion de identidad de
  // la linea: si otro admin edito/quito lineas de la requisicion (editor
  // nuevo), el indice puede apuntar a otra linea — se aborta con aviso en
  // vez de marcar la equivocada o pisar la edicion.
  const toggleDeducido = async (reqId, idx) => {
    let base = reqs;
    try { const c = await store.getCloud("ep-reqs"); if (Array.isArray(c) && c.length) base = c; } catch { /* nube caída: memoria */ }
    const localLinea = reqs.find((r) => r.id === reqId)?.lineas?.[idx];
    const cloudReq = base.find((r) => r.id === reqId);
    const cloudLinea = cloudReq?.lineas?.[idx];
    if (!cloudReq || !cloudLinea || !localLinea || cloudLinea.itemId !== localLinea.itemId || cloudLinea.paraEmpId !== localLinea.paraEmpId) {
      alert("⚠ Esta requisición fue modificada por otro usuario. Recargá la página e intentá de nuevo.");
      return;
    }
    const marcar = !cloudLinea.deducido;
    const next = base.map((r) => r.id !== reqId ? r : { ...r, lineas: r.lineas.map((l, i) => (i === idx ? { ...l, deducido: marcar, deducidoPor: marcar ? userName : undefined, deducidoAt: marcar ? new Date().toISOString() : undefined } : l)) });
    setReqs(next);
    const ok = await store.set("ep-reqs", next);
    if (!ok) alert("⚠ No se guardó en la nube (ep-reqs).");
  };

  // ══════════════════════════ POR COMPRAR (PO) ══════════════════════════
  const ESTADOS_PO = {
    pendiente: { label: "PENDIENTE", color: "#B45309", bg: "rgba(180,83,9,0.12)" },
    enviada:   { label: "ENVIADA AL PROVEEDOR", color: BRAND.blue, bg: BRAND.blueSoft },
    recibida:  { label: "RECIBIDA", color: BRAND.green, bg: BRAND.greenSoft },
  };
  const posAbiertas = pos.filter((p) => p.estado !== "recibida").length;

  // Desde una requisicion: lo solicitado que NO alcanza el stock se manda a
  // "Por comprar" con un click. El stock disponible descuenta lo COMPROMETIDO
  // en las demas requisiciones abiertas (pendientes/aprobadas) del mismo
  // item, para que dos requisiciones no se "coman" el mismo stock. Items ya
  // borrados del catalogo se avisan (no se descartan en silencio).
  const crearPoDesdeReq = async (r) => {
    const agg = {};       // itemId → total pedido
    const aggProy = {};   // itemId → { proyecto → qty } (para repartir el faltante)
    const sinItem = [];
    (r.lineas || []).forEach((l) => {
      if (l.itemId && itemById(l.itemId)) {
        agg[l.itemId] = (agg[l.itemId] || 0) + (Number(l.qty) || 0);
        const pr = l.proyecto || "";
        (aggProy[l.itemId] = aggProy[l.itemId] || {})[pr] = (aggProy[l.itemId]?.[pr] || 0) + (Number(l.qty) || 0);
      } else sinItem.push(`${l.qty} × ${l.nombre}`);
    });
    const comprometido = {};
    reqs.forEach((rq) => {
      if (rq.id === r.id || (rq.estado !== "pendiente" && rq.estado !== "aprobada")) return;
      (rq.lineas || []).forEach((l) => { if (l.itemId) comprometido[l.itemId] = (comprometido[l.itemId] || 0) + (Number(l.qty) || 0); });
    });
    const faltantes = [];
    Object.entries(agg).forEach(([iid, qty]) => {
      const it = itemById(iid);
      const disponible = Math.max(0, (Number(it.stock) || 0) - (comprometido[iid] || 0));
      let falta = qty - disponible;
      if (falta <= 0) return;
      // Repartir el faltante entre los proyectos que pidieron este item
      // (greedy, de mayor a menor demanda) — asi cada linea de la PO queda
      // cargada al proyecto correspondiente. El stock disponible se asume
      // cubriendo primero a los proyectos con MENOR demanda (el remanente
      // grande es el que se compra).
      const porProy = Object.entries(aggProy[iid] || { "": qty }).sort((a, b) => b[1] - a[1]);
      for (const [pr, q] of porProy) {
        if (falta <= 0) break;
        const asignar = Math.min(q, falta);
        faltantes.push({ itemId: iid, codigo: it.codigo || "", nombre: it.nombre, talla: it.talla || "", proveedorId: it.proveedorId || "", cant: asignar, proyecto: pr });
        falta -= asignar;
      }
    });
    const avisoSinItem = sinItem.length ? `\n\n⚠ ${sinItem.length} línea(s) apuntan a ítems que YA NO existen en el catálogo y NO se incluyen:\n${sinItem.map((s) => "  " + s).join("\n")}` : "";
    if (!faltantes.length) return alert((Object.keys(agg).length ? "Todo lo solicitado alcanza con el stock disponible (descontando lo comprometido en otras requisiciones abiertas) — no hay nada que comprar. ✔" : "No se pudo evaluar ninguna línea de esta requisición.") + avisoSinItem);
    const lista = faltantes.map((f) => `  ${f.cant} × ${f.nombre}${f.talla ? ` (Talla ${f.talla})` : ""}${f.codigo ? `  [${f.codigo}]` : ""}${f.proyecto ? `  → ${f.proyecto}` : ""}`).join("\n");
    if (!confirm(`Se creará una orden POR COMPRAR con lo que NO alcanza el stock para ${r.numero}\n(disponible = stock actual − comprometido en otras requisiciones abiertas):\n\n${lista}${avisoSinItem}\n\n¿Continuar?`)) return;
    const po = await crearPo(faltantes, r.numero);
    if (po) { setSec("porcomprar"); alert(`✅ ${po.numero} creada con ${faltantes.length} ítem(s). Generá el PDF y mandáselo al proveedor.`); }
  };

  // PDF de la orden: agrupado POR PROVEEDOR (el codigo de cada item ya viene
  // amarrado a la tienda donde se compra) — listo para pedir cotizacion.
  const exportPoPDF = (po) => {
    const w = window.open("", "_blank");
    if (!w) { alert("Permite popups para generar el PDF"); return; }
    // Escape HTML: nombres/codigos son texto libre — sin esto un "<" o "&"
    // en el nombre de un item rompe la tabla del PDF que se le manda al
    // proveedor.
    const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const logoUrl = `${import.meta.env.BASE_URL}brand/logo-color.png`;
    const porProv = {};
    (po.lines || []).forEach((l) => { const k = l.proveedorId || "?"; (porProv[k] = porProv[k] || []).push(l); });
    const provSection = (provId, lines) => {
      const p = providers.find((x) => x.id === provId);
      return `<div style="margin-bottom:16px;border:1px solid #DBD4C8;border-radius:10px;overflow:hidden;page-break-inside:avoid">
        <div style="background:#2C2A28;color:#fff;padding:8px 14px;display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:800;font-size:13px">🏪 ${esc(p ? p.nombre : "Proveedor por definir")}</span>
          <span style="font-size:10.5px;color:#C9C2B7">${esc(p ? [p.contacto, p.telefono, p.correo].filter(Boolean).join(" · ") : "")}</span>
        </div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:#F7F1E8">
            <th style="text-align:left;padding:6px 14px;font-size:9px;color:#7A7268;letter-spacing:0.5px">CÓDIGO</th>
            <th style="text-align:left;padding:6px 10px;font-size:9px;color:#7A7268;letter-spacing:0.5px">DESCRIPCIÓN</th>
            <th style="text-align:center;padding:6px 10px;font-size:9px;color:#7A7268;letter-spacing:0.5px">TALLA</th>
            <th style="text-align:left;padding:6px 10px;font-size:9px;color:#7A7268;letter-spacing:0.5px">PROYECTO</th>
            <th style="text-align:right;padding:6px 14px;font-size:9px;color:#7A7268;letter-spacing:0.5px">CANTIDAD</th>
          </tr></thead>
          <tbody>${lines.map((l) => `<tr>
            <td style="padding:7px 14px;font-family:ui-monospace,Menlo,monospace;font-size:11px;font-weight:700;color:#C75F1F;border-top:1px solid #F1EBE0">${esc(l.codigo) || "—"}</td>
            <td style="padding:7px 10px;font-size:11.5px;font-weight:600;border-top:1px solid #F1EBE0">${esc(l.nombre)}</td>
            <td style="padding:7px 10px;font-size:11px;text-align:center;color:#0F766E;font-weight:700;border-top:1px solid #F1EBE0">${esc(l.talla) || "—"}</td>
            <td style="padding:7px 10px;font-size:10.5px;font-weight:700;color:#C75F1F;border-top:1px solid #F1EBE0">${esc(l.proyecto) || "—"}</td>
            <td style="padding:7px 14px;font-size:13px;font-weight:800;text-align:right;border-top:1px solid #F1EBE0">${l.cant}</td>
          </tr>`).join("")}</tbody>
        </table>
      </div>`;
    };
    const totalUds = (po.lines || []).reduce((s, l) => s + l.cant, 0);
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${po.numero} — Orden de compra</title>
      <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:30px;color:#2C2A28;-webkit-print-color-adjust:exact;print-color-adjust:exact}@media print{.np{display:none}}</style>
      </head><body>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:14px">
          <img src="${logoUrl}" style="height:46px" onerror="this.style.display='none'" />
          <div>
            <div style="font-size:21px;font-weight:800;color:#E8762D;letter-spacing:-0.3px">ORDEN DE COMPRA</div>
            <div style="font-size:12px;color:#7A7268;margin-top:2px">Grupo Geotecnica · Solicitud de cotización de EPP</div>
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-family:ui-monospace,Menlo,monospace;font-size:17px;font-weight:800;color:#2C2A28">${po.numero}</div>
          <div style="font-size:11px;color:#7A7268">${fmtDate(po.fecha)}${po.fuente ? ` · Origen: ${po.fuente}` : ""}</div>
        </div>
      </div>
      <div style="height:4px;background:#E8762D;border-radius:2px;margin:14px 0 16px"></div>
      <div style="background:#FFFBF5;border:1px solid #DBD4C8;border-radius:10px;padding:10px 14px;font-size:11.5px;color:#5C5853;margin-bottom:16px">
        Estimado proveedor: favor <b>cotizar formalmente</b> los siguientes ítems (${totalUds} unidad${totalUds !== 1 ? "es" : ""}). Los códigos corresponden a su catálogo. Agradecemos indicar disponibilidad, precio unitario y tiempo de entrega.
      </div>
      ${Object.entries(porProv).map(([pid, lines]) => provSection(pid, lines)).join("")}
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:26px;gap:20px">
        <div style="font-size:10px;color:#8B847C">Documento generado por GeoSafety · Sistema de Operaciones — Grupo Geotecnica</div>
        <div style="text-align:center">
          <div style="border-top:1.5px solid #2C2A28;width:220px;padding-top:5px;font-size:11px;font-weight:700">${esc(userName)}</div>
          <div style="font-size:9.5px;color:#7A7268">Compras / Seguridad Industrial · Grupo Geotecnica</div>
        </div>
      </div>
      <br><button class="np" onclick="window.print()" style="padding:10px 24px;font-size:14px;cursor:pointer;background:#E8762D;color:#fff;border:none;border-radius:8px;font-weight:700">Imprimir / Guardar como PDF</button>
      </body></html>`);
    w.document.close();
  };

  // PDF de una REQUISICION agrupado por proveedor: UNA PAGINA POR PROVEEDOR
  // (page-break entre secciones) con cantidades CONSOLIDADAS por item — asi
  // cada hoja se manda a su proveedor por separado, aunque la requisicion
  // mezcle gafas de Larach con guantes de Chispa. Incluye desglose por
  // proyecto por item (control interno de fondos, no le estorba al proveedor).
  const exportReqPDF = (r) => {
    const w = window.open("", "_blank");
    if (!w) { alert("Permite popups para generar el PDF"); return; }
    const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const logoUrl = `${import.meta.env.BASE_URL}brand/logo-color.png`;
    // Agrupar por proveedor (string) y consolidar por item+talla
    const porProv = {};
    (r.lineas || []).forEach((l) => {
      const prov = l.proveedor || "Proveedor por definir";
      const key = `${l.itemId || l.nombre}|${l.talla || ""}`;
      const g = (porProv[prov] = porProv[prov] || {});
      if (!g[key]) g[key] = { codigo: l.codigo || itemById(l.itemId)?.codigo || "", nombre: l.nombre, talla: l.talla || itemById(l.itemId)?.talla || "", cant: 0, proys: {} };
      g[key].cant += Number(l.qty) || 0;
      const pr = l.proyecto || "SIN PROYECTO";
      g[key].proys[pr] = (g[key].proys[pr] || 0) + (Number(l.qty) || 0);
    });
    const provs = Object.entries(porProv);
    const seccion = (prov, itemsMap, idx) => {
      const rows = Object.values(itemsMap);
      const totalUds = rows.reduce((s, x) => s + x.cant, 0);
      return `<div style="${idx < provs.length - 1 ? "page-break-after:always;" : ""}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:14px">
            <img src="${logoUrl}" style="height:44px" onerror="this.style.display='none'" />
            <div>
              <div style="font-size:19px;font-weight:800;color:#E8762D;letter-spacing:-0.3px">SOLICITUD DE COTIZACIÓN — EPP</div>
              <div style="font-size:11.5px;color:#7A7268;margin-top:2px">Grupo Geotecnica · Requisición ${esc(r.numero)} · ${fmtDate(r.fecha)}</div>
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-size:15px;font-weight:800;color:#2C2A28">🏪 ${esc(prov)}</div>
            <div style="font-size:11px;color:#7A7268">${totalUds} unidad${totalUds !== 1 ? "es" : ""} solicitadas</div>
          </div>
        </div>
        <div style="height:4px;background:#E8762D;border-radius:2px;margin:12px 0 14px"></div>
        <table style="width:100%;border-collapse:collapse;border:1px solid #DBD4C8;border-radius:10px;overflow:hidden">
          <thead><tr style="background:#F7F1E8">
            <th style="text-align:left;padding:7px 14px;font-size:9px;color:#7A7268;letter-spacing:0.5px">CÓDIGO</th>
            <th style="text-align:left;padding:7px 10px;font-size:9px;color:#7A7268;letter-spacing:0.5px">DESCRIPCIÓN</th>
            <th style="text-align:center;padding:7px 10px;font-size:9px;color:#7A7268;letter-spacing:0.5px">TALLA</th>
            <th style="text-align:left;padding:7px 10px;font-size:9px;color:#7A7268;letter-spacing:0.5px">DESGLOSE POR PROYECTO</th>
            <th style="text-align:right;padding:7px 14px;font-size:9px;color:#7A7268;letter-spacing:0.5px">CANT. TOTAL</th>
          </tr></thead>
          <tbody>${rows.map((x) => `<tr>
            <td style="padding:7px 14px;font-family:ui-monospace,Menlo,monospace;font-size:11px;font-weight:700;color:#C75F1F;border-top:1px solid #F1EBE0">${esc(x.codigo) || "—"}</td>
            <td style="padding:7px 10px;font-size:11.5px;font-weight:600;border-top:1px solid #F1EBE0">${esc(x.nombre)}</td>
            <td style="padding:7px 10px;font-size:11px;text-align:center;color:#0F766E;font-weight:700;border-top:1px solid #F1EBE0">${esc(x.talla) || "—"}</td>
            <td style="padding:7px 10px;font-size:10px;color:#7A7268;border-top:1px solid #F1EBE0">${Object.entries(x.proys).map(([p, q]) => `${esc(p)} ×${q}`).join(" · ")}</td>
            <td style="padding:7px 14px;font-size:13px;font-weight:800;text-align:right;border-top:1px solid #F1EBE0">${x.cant}</td>
          </tr>`).join("")}</tbody>
        </table>
        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:24px;gap:20px">
          <div style="font-size:10px;color:#8B847C">Documento generado por GeoSafety · Sistema de Operaciones — Grupo Geotecnica · ${esc(r.numero)}</div>
          <div style="text-align:center">
            <div style="border-top:1.5px solid #2C2A28;width:220px;padding-top:5px;font-size:11px;font-weight:700">${esc(userName)}</div>
            <div style="font-size:9.5px;color:#7A7268">Compras / Seguridad Industrial · Grupo Geotecnica</div>
          </div>
        </div>
      </div>`;
    };
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(r.numero)} — Solicitud por proveedor</title>
      <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:30px;color:#2C2A28;-webkit-print-color-adjust:exact;print-color-adjust:exact}@media print{.np{display:none}}</style>
      </head><body>
      ${provs.map(([prov, itemsMap], idx) => seccion(prov, itemsMap, idx)).join("")}
      <br><button class="np" onclick="window.print()" style="padding:10px 24px;font-size:14px;cursor:pointer;background:#E8762D;color:#fff;border:none;border-radius:8px;font-weight:700">Imprimir / Guardar como PDF</button>
      </body></html>`);
    w.document.close();
  };

  const renderPorComprar = () => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ background: BRAND.blueSoft, border: `1px solid ${BRAND.blue}30`, borderRadius: R.md, padding: "9px 14px", fontSize: 12.5, color: BRAND.ink, flex: 1, minWidth: 280 }}>
          🧾 <b>Por comprar (PO)</b>: lo que falta en stock. Desde una requisición usá <b>"Faltantes → Por comprar"</b>, o creá una orden desde cero. El <b>PDF sale agrupado por proveedor</b>. Al marcar <b>"✓ Recibida"</b> registrás las cantidades y <b>precios reales</b> de la factura — ahí las unidades ENTRAN al stock del almacén y el costo verídico queda en Costos.
        </div>
        {canManage && <Btn onClick={() => setModal({ t: "po-new" })}>+ Nueva orden</Btn>}
      </div>
      {!pos.length && <div style={{ textAlign: "center", padding: 50, color: BRAND.stone, background: "#fff", borderRadius: R.lg, border: `1px dashed ${BRAND.border}` }}>Sin órdenes de compra todavía.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {pos.map((po) => {
          const est = ESTADOS_PO[po.estado] || ESTADOS_PO.pendiente;
          const proyectosPo = [...new Set((po.lines || []).map((l) => l.proyecto).filter(Boolean))];
          return (
            <div key={po.id} style={{ background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.lg, overflow: "hidden", boxShadow: BRAND.shadowSm }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", gap: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: FONT.mono, fontWeight: 800, fontSize: 14, color: BRAND.charcoal }}>{po.numero}</span>
                  <Chip color={est.color} bg={est.bg}>{est.label}</Chip>
                  {proyectosPo.map((pr) => <Chip key={pr} color={BRAND.orange} bg="rgba(232,118,45,0.10)">🏗 {pr}</Chip>)}
                  <span style={{ fontSize: 12, color: BRAND.graphite }}>{fmtDate(po.fecha)}{po.fuente ? <> · de <b style={{ color: BRAND.orange }}>{po.fuente}</b></> : " · creada desde cero"} · {po.creadoPor}</span>
                  {po.estado === "recibida" && po.totalReal != null && <Chip color={BRAND.green} bg={BRAND.greenSoft}>💰 Total real: {fmtL(po.totalReal)}</Chip>}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Btn small variant="info" onClick={() => exportPoPDF(po)}>📄 PDF para proveedor</Btn>
                  {canManage && po.estado === "pendiente" && <Btn small variant="ghost" onClick={async () => { await sPos(pos.map((x) => (x.id === po.id ? { ...x, estado: "enviada", enviadaAt: new Date().toISOString() } : x))); }}>✉ Marcar enviada</Btn>}
                  {canManage && po.estado === "enviada" && <Btn small variant="success" onClick={() => setModal({ t: "po-recibo", po })}>✓ Recibida…</Btn>}
                  {userRole === "admin" && <Btn small variant="ghost" style={{ color: BRAND.red }} onClick={async () => { if (!confirm(`¿ELIMINAR la orden ${po.numero}?`)) return; await sPos(pos.filter((x) => x.id !== po.id)); }}>🗑</Btn>}
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr style={{ background: BRAND.beigeLight }}><th style={th}>Código</th><th style={th}>Ítem</th><th style={th}>Talla</th><th style={th}>Proveedor</th><th style={th}>Proyecto</th><th style={{ ...th, textAlign: "right" }}>Pedido</th>{po.estado === "recibida" && <><th style={{ ...th, textAlign: "right" }}>Recibido</th><th style={{ ...th, textAlign: "right" }}>Precio real</th><th style={{ ...th, textAlign: "right" }}>Subtotal</th></>}</tr></thead>
                  <tbody>
                    {(po.lines || []).map((l, i) => (
                      <tr key={i}>
                        <td style={{ ...td, fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, color: BRAND.orange }}>{l.codigo || "—"}</td>
                        <td style={{ ...td, fontWeight: 700 }}>{l.nombre}</td>
                        <td style={{ ...td, color: "#0F766E", fontWeight: 700 }}>{l.talla || "—"}</td>
                        <td style={td}>{provName(l.proveedorId)}</td>
                        <td style={td}>{l.proyecto ? <Chip color={BRAND.orange} bg="rgba(232,118,45,0.10)">{l.proyecto}</Chip> : <span style={{ color: BRAND.stone, fontSize: 11 }}>—</span>}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{l.cant}</td>
                        {po.estado === "recibida" && <>
                          <td style={{ ...td, textAlign: "right", fontWeight: 800, color: (l.cantRecibida ?? l.cant) !== l.cant ? "#B45309" : BRAND.charcoal }}>{l.cantRecibida ?? l.cant}</td>
                          <td style={{ ...td, textAlign: "right" }}>{l.precioReal != null ? fmtL(l.precioReal) : "—"}</td>
                          <td style={{ ...td, textAlign: "right", fontWeight: 800, color: GREEN }}>{l.precioReal != null ? fmtL((Number(l.precioReal) || 0) * (Number(l.cantRecibida ?? l.cant) || 0)) : "—"}</td>
                        </>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

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
                    {(it.codigo || it.talla) && <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      {it.codigo && <span style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, color: BRAND.orange, letterSpacing: 0.4 }}>#{it.codigo}</span>}
                      {it.talla && <Chip color="#0F766E" bg="#CCFBF1">TALLA {it.talla}</Chip>}
                    </div>}
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
                        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 70px 1fr 1fr 30px", gap: 8, alignItems: "end" }}>
                          <Select label={di === 0 ? "Para (colaborador)" : ""} placeholder="— Seleccionar —" value={d.empId} onChange={(e) => {
                            const empId = e.target.value;
                            // Auto-fill del proyecto segun la ultima asistencia de GeoTeam
                            // (attAssign). Solo si el usuario no eligio uno a mano ya.
                            updDest(l.key, di, { empId, proj: d.proj || attAssign[empId] || "" });
                          }} options={activeEmps.map((e) => ({ value: e.id, label: `${e.fullName} · ${coTag(e.company)}` }))} />
                          <Input label={di === 0 ? "Cant." : ""} type="number" min="1" value={d.qty} onChange={(e) => updDest(l.key, di, { qty: e.target.value })} />
                          <Select label={di === 0 ? "Motivo" : ""} placeholder="— Seleccionar —" value={d.motivo} onChange={(e) => updDest(l.key, di, { motivo: e.target.value })} options={MOTIVOS.map((m) => ({ value: m.value, label: m.label }))} />
                          <Select label={di === 0 ? "Proyecto" : ""} placeholder="— Proyecto —" value={d.proj || ""} onChange={(e) => updDest(l.key, di, { proj: e.target.value })} options={projOptions} />
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
  // Card COMPLETA de una requisición: header con acciones + desglose agrupado
  // por tipo de EPP. La usa la vista detalle del tablero (clic en una tarjeta).
  const renderReqFull = (r) => {
            const est = ESTADOS[r.estado] || ESTADOS.pendiente;
            const tienePerdida = (r.lineas || []).some((l) => l.motivo === "perdida");
            const proyectosReq = [...new Set((r.lineas || []).map((l) => l.proyecto).filter(Boolean))];
            return (
              <div key={r.id} style={{ background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.lg, overflow: "hidden", boxShadow: BRAND.shadowSm }}>
                {tienePerdida && <div style={{ background: BRAND.redSoft, borderBottom: `1px solid ${BRAND.red}30`, padding: "7px 16px", fontSize: 12, fontWeight: 800, color: BRAND.red }}>⚠ CONTIENE PÉRDIDA/EXTRAVÍO — genera descuento en planilla</div>}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 16px", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: FONT.mono, fontWeight: 800, fontSize: 14, color: BRAND.orange }}>{r.numero}</span>
                    <Chip color={est.color} bg={est.bg}>{est.label}</Chip>
                    {proyectosReq.map((pr) => <Chip key={pr} color={BRAND.orange} bg="rgba(232,118,45,0.10)">🏗 {pr}</Chip>)}
                    <span style={{ fontSize: 12.5, color: BRAND.graphite }}>Solicitó: <b>{r.solicitante}</b> · {fmtDate(r.fecha)}{r.editadoPor ? <span style={{ color: "#B45309" }}> · ✏️ editada por {r.editadoPor}</span> : null}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontWeight: 800, color: GREEN, fontSize: 14 }}>{fmtL(r.total)}</span>
                    <Btn small variant="info" onClick={() => exportReqPDF(r)} style={{ whiteSpace: "nowrap" }}>📄 PDF proveedores</Btn>
                    {canManage && r.estado === "pendiente" && <><Btn small variant="success" onClick={() => setEstadoReq(r, "aprobada")}>✓ Aprobar</Btn><Btn small variant="danger" onClick={() => setEstadoReq(r, "rechazada")}>✕ Rechazar</Btn></>}
                    {canManage && r.estado === "aprobada" && <Btn small variant="info" onClick={() => setEstadoReq(r, "entregada")}>📦 Marcar entregada</Btn>}
                    {canManage && (r.estado === "pendiente" || r.estado === "aprobada") && <Btn small variant="ghost" style={{ color: "#B45309" }} onClick={() => crearPoDesdeReq(r)}>🧾 Faltantes → Por comprar</Btn>}
                    {userRole === "admin" && (r.estado === "pendiente" || r.estado === "aprobada") && <Btn small variant="ghost" onClick={() => setModal({ t: "req-edit", req: r })}>✏️ Editar</Btn>}
                    {userRole === "admin" && <Btn small variant="ghost" style={{ color: BRAND.red }} onClick={async () => { if (!confirm(`¿ELIMINAR la requisición ${r.numero}?\n\nSe borra del historial. No se puede deshacer.`)) return; await sReqs(reqs.filter((x) => x.id !== r.id)); }}>🗑</Btn>}
                  </div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr style={{ background: BRAND.beigeLight }}><th style={th}>Código</th><th style={th}>Ítem</th><th style={th}>Proveedor</th><th style={th}>Para</th><th style={th}>Proyecto</th><th style={th}>Motivo</th><th style={{ ...th, textAlign: "right" }}>Cant.</th><th style={{ ...th, textAlign: "right" }}>Precio</th><th style={{ ...th, textAlign: "right" }}>Subtotal</th></tr></thead>
                    <tbody>
                      {(() => {
                        // Lineas agrupadas por TIPO de EPP: cada grupo con su
                        // subheader (icono + label + uds + subtotal). Mucho mas
                        // legible que la tabla plana cuando una requisicion trae
                        // gafas + guantes + botas de proveedores distintos.
                        const grupos = {};
                        (r.lineas || []).forEach((l, i) => {
                          const t = tipoDeLinea(l);
                          (grupos[t] = grupos[t] || []).push({ l, i });
                        });
                        return Object.entries(grupos).map(([t, arr]) => {
                          const def = tipoDef(t);
                          const uds = arr.reduce((s, { l }) => s + (Number(l.qty) || 0), 0);
                          const sub = arr.reduce((s, { l }) => s + (Number(l.precio) || 0) * (Number(l.qty) || 0), 0);
                          return (
                            <Fragment key={t}>
                              <tr style={{ background: "#F7F1E8" }}>
                                <td colSpan={9} style={{ padding: "6px 14px", fontSize: 11.5, fontWeight: 800, color: BRAND.graphite, borderTop: `2px solid ${BRAND.border}` }}>
                                  {def.icon} {def.label} <span style={{ color: BRAND.stone, fontWeight: 700 }}>· {uds} uds</span> <span style={{ color: GREEN, fontWeight: 800, marginLeft: 6 }}>{fmtL(sub)}</span>
                                </td>
                              </tr>
                              {arr.map(({ l, i }) => {
                                const m = motivoDef(l.motivo);
                                return (
                                  <tr key={i}>
                                    <td style={{ ...td, fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, color: BRAND.orange }}>{l.codigo || itemById(l.itemId)?.codigo || "—"}</td>
                                    <td style={{ ...td, fontWeight: 700 }}>{l.nombre}{(l.talla || itemById(l.itemId)?.talla) ? <span style={{ color: "#0F766E", fontWeight: 800 }}> · Talla {l.talla || itemById(l.itemId)?.talla}</span> : null}</td>
                                    <td style={td}>{l.proveedor}</td>
                                    <td style={td}>{l.paraNombre} <span style={{ fontSize: 10, color: BRAND.stone, fontWeight: 700 }}>{l.paraEmpresa ? coTag(l.paraEmpresa) : ""}</span></td>
                                    <td style={td}>{l.proyecto ? <Chip color={BRAND.orange} bg="rgba(232,118,45,0.10)">{l.proyecto}</Chip> : <span style={{ color: BRAND.stone, fontSize: 11 }}>—</span>}</td>
                                    <td style={td}><Chip color={m.color} bg={m.bg}>{m.chip}</Chip>{l.motivo === "perdida" && l.deducido && <Chip color={GREEN} bg={BRAND.greenSoft} style={{ marginLeft: 5 }}>DEDUCIDO ✓</Chip>}</td>
                                    <td style={{ ...td, textAlign: "right" }}>{l.qty}</td>
                                    <td style={{ ...td, textAlign: "right" }}>{fmtL(l.precio)}</td>
                                    <td style={{ ...td, textAlign: "right", fontWeight: 700, color: GREEN }}>{fmtL(l.precio * l.qty)}</td>
                                  </tr>
                                );
                              })}
                            </Fragment>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            );
  };

  const renderRequisiciones = () => {
    const abierta = reqOpen ? reqs.find((r) => r.id === reqOpen) : null;

    // ── Vista DETALLE: una requisición con su desglose completo ──
    if (abierta) {
      return (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <Btn small variant="ghost" onClick={() => setReqOpen(null)}>← Volver al tablero</Btn>
            <span style={{ fontSize: 12.5, color: BRAND.stone }}>Requisiciones · <b style={{ color: BRAND.charcoal }}>{abierta.numero}</b> · desglose completo</span>
          </div>
          {renderReqFull(abierta)}
        </div>
      );
    }

    // ── Tablero KANBAN por estado: tarjetas compactas, clic → detalle ──
    if (!reqs.length) return <div style={{ textAlign: "center", padding: 50, color: BRAND.stone, background: "#fff", borderRadius: R.lg, border: `1px dashed ${BRAND.border}` }}>Sin requisiciones todavía. Se crean desde el catálogo con el carrito 🛒.</div>;
    return (
      <div>
        <div style={{ fontSize: 12.5, color: BRAND.stone, marginBottom: 12 }}>{reqs.length} requisición(es) · hacé clic en una tarjeta para ver el desglose completo y las acciones</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(245px, 1fr))", gap: 12, alignItems: "start" }}>
          {Object.entries(ESTADOS).map(([est, def]) => {
            const arr = reqs.filter((r) => (r.estado || "pendiente") === est).sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
            const totalCol = arr.reduce((s, r) => s + (Number(r.total) || 0), 0);
            return (
              <div key={est} style={{ background: "rgba(219,212,200,0.22)", border: `1px solid ${BRAND.border}`, borderRadius: R.lg, padding: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "2px 4px 10px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 800, color: def.color, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: def.color, display: "inline-block" }} />
                    {def.label}
                    <span style={{ background: def.bg, color: def.color, borderRadius: 999, padding: "1px 8px", fontSize: 11 }}>{arr.length}</span>
                  </span>
                  {totalCol > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: GREEN }}>{fmtL(totalCol)}</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 640, overflowY: "auto" }}>
                  {!arr.length && <div style={{ textAlign: "center", padding: "20px 8px", fontSize: 11.5, color: BRAND.stone, border: `1px dashed ${BRAND.border}`, borderRadius: R.md, background: "rgba(255,255,255,0.5)" }}>Sin requisiciones</div>}
                  {arr.map((r) => {
                    const tienePerdida = (r.lineas || []).some((l) => l.motivo === "perdida");
                    const proyectosReq = [...new Set((r.lineas || []).map((l) => l.proyecto).filter(Boolean))];
                    const personas = new Set((r.lineas || []).map((l) => l.empId || l.paraNombre)).size;
                    const tipos = {};
                    (r.lineas || []).forEach((l) => { const t = tipoDeLinea(l); tipos[t] = (tipos[t] || 0) + (Number(l.qty) || 0); });
                    return (
                      <div key={r.id} onClick={() => setReqOpen(r.id)}
                        onMouseEnter={(ev) => { ev.currentTarget.style.transform = "translateY(-2px)"; ev.currentTarget.style.boxShadow = BRAND.shadowLg; }}
                        onMouseLeave={(ev) => { ev.currentTarget.style.transform = "none"; ev.currentTarget.style.boxShadow = BRAND.shadowSm; }}
                        style={{ background: "#fff", border: `1px solid ${BRAND.border}`, borderLeft: `4px solid ${def.color}`, borderRadius: R.md, padding: "11px 12px", cursor: "pointer", boxShadow: BRAND.shadowSm, transition: "transform .1s, box-shadow .1s" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <span style={{ fontFamily: FONT.mono, fontWeight: 800, fontSize: 13.5, color: BRAND.orange }}>{r.numero}</span>
                          <span style={{ fontSize: 11, color: BRAND.stone, fontWeight: 700 }}>{fmtDate(r.fecha)}</span>
                        </div>
                        <div style={{ fontSize: 11.5, color: BRAND.graphite, marginTop: 3 }}>Solicitó <b>{r.solicitante}</b>{r.editadoPor ? <span style={{ color: "#B45309" }} title={`Editada por ${r.editadoPor}`}> · ✏️</span> : null}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                          {Object.entries(tipos).map(([t, uds]) => {
                            const tdef = tipoDef(t);
                            return <span key={t} title={tdef.label} style={{ fontSize: 11, fontWeight: 700, color: BRAND.graphite, background: BRAND.beigeLight, border: `1px solid ${BRAND.border}`, borderRadius: 999, padding: "2px 8px" }}>{tdef.icon} {uds}</span>;
                          })}
                        </div>
                        {(proyectosReq.length > 0 || tienePerdida) && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
                            {proyectosReq.map((pr) => <Chip key={pr} color={BRAND.orange} bg="rgba(232,118,45,0.10)">🏗 {pr}</Chip>)}
                            {tienePerdida && <Chip color={BRAND.red} bg={BRAND.redSoft}>⚠ PÉRDIDA</Chip>}
                          </div>
                        )}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 9, paddingTop: 8, borderTop: `1px dashed ${BRAND.border}` }}>
                          <span style={{ fontSize: 11.5, color: BRAND.stone, fontWeight: 700 }}>👥 {personas} colab. · {(r.lineas || []).length} líneas</span>
                          <span style={{ fontWeight: 800, color: GREEN, fontSize: 13.5 }}>{fmtL(r.total)}</span>
                        </div>
                      </div>
                    );
                  })}
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
        ) : (() => {
          // ── Agrupado POR PROYECTO según la última quincena registrada en la
          // asistencia de GeoTeam. Jornaleros van en su propio grupo JORNAL;
          // oficina y quienes no están en cuadrilla, al final.
          const card = (e) => {
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
          };
          const groups = {};
          list.forEach((e) => {
            const g = e.esJornal ? "JORNAL"
              : (attAssign[e.id] || (dotacionDe[e.id]?.puesto === "oficina" ? "OFICINA / ADMIN" : "SIN CUADRILLA"));
            (groups[g] = groups[g] || []).push(e);
          });
          const rank = (g) => (g === "JORNAL" ? 1 : g === "OFICINA / ADMIN" ? 2 : g === "SIN CUADRILLA" ? 3 : 0);
          const orden = Object.keys(groups).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
          const gColor = (g) => (g === "JORNAL" ? "#B45309" : g === "OFICINA / ADMIN" ? BRAND.stone : g === "SIN CUADRILLA" ? BRAND.ash : BRAND.charcoal);
          if (!orden.length) return <div style={{ textAlign: "center", padding: 30, color: BRAND.stone, fontSize: 13 }}>Sin colaboradores con esos filtros.</div>;
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {attAssignLabel && <div style={{ fontSize: 11.5, color: BRAND.stone, marginTop: -6 }}>Distribución por proyecto según la última asistencia registrada en GeoTeam: <b>{attAssignLabel}</b></div>}
              {orden.map((g) => {
                const done = groups[g].filter((e) => dotacionDe[e.id]?.completo).length;
                return (
                  <div key={g}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, background: gColor(g), color: "#fff", borderRadius: `${R.md}px ${R.md}px 0 0`, padding: "8px 14px" }}>
                      <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: 0.3 }}>{g === "JORNAL" ? "👷 JORNAL (por día)" : `📍 ${g}`}</span>
                      <span style={{ fontSize: 11.5, opacity: 0.85 }}>{groups[g].length} persona{groups[g].length !== 1 ? "s" : ""}{g !== "OFICINA / ADMIN" ? ` · ${done} con EPP completo` : ""}</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 14, background: "rgba(255,255,255,0.5)", border: `1px solid ${BRAND.borderSoft}`, borderTop: "none", borderRadius: `0 0 ${R.md}px ${R.md}px`, padding: 12 }}>
                      {groups[g].map(card)}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
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

  // ══════════════════════════ COSTOS EPP POR PROYECTO ══════════════════════════
  // Gasto de EPP cargado a cada proyecto, por mes. Fuente: requisiciones NO
  // rechazadas (pendiente/aprobada/entregada = gasto comprometido). Cada
  // linea suma precio × qty al proyecto que se le asigno en el carrito.
  // Lineas viejas sin proyecto caen en "SIN PROYECTO".
  const renderCostos = () => {
    const noRechazadas = reqs.filter((r) => r.estado !== "rechazada");
    const mesDe = (iso) => String(iso || "").slice(0, 7);

    // ── Detalle del mes seleccionado: proyecto → { total, uds, reqNums } ──
    const delMes = noRechazadas.filter((r) => mesDe(r.fecha) === costosMes);
    const porProy = {};
    delMes.forEach((r) => {
      (r.lineas || []).forEach((l) => {
        const pr = l.proyecto || "SIN PROYECTO";
        if (!porProy[pr]) porProy[pr] = { total: 0, uds: 0, reqNums: new Set() };
        porProy[pr].total += (Number(l.precio) || 0) * (Number(l.qty) || 0);
        porProy[pr].uds += Number(l.qty) || 0;
        porProy[pr].reqNums.add(r.numero);
      });
    });
    // ── Gasto REAL del mes: POs RECIBIDAS (precios reales de factura) ──
    // El comprometido (requisiciones) estima con precios de catalogo; el real
    // sale de lo que efectivamente se compro y recibio en el mes.
    const realPorProy = {};
    pos.filter((p) => p.estado === "recibida" && mesDe(p.recibidaAt || p.fecha) === costosMes).forEach((p) => {
      (p.lines || []).forEach((l) => {
        const pr = l.proyecto || "SIN PROYECTO";
        const precio = l.precioReal != null ? Number(l.precioReal) : (Number(itemById(l.itemId)?.precio) || 0);
        const cant = Number(l.cantRecibida ?? l.cant) || 0;
        realPorProy[pr] = (realPorProy[pr] || 0) + precio * cant;
      });
    });
    const totalRealMes = Object.values(realPorProy).reduce((s, v) => s + v, 0);

    // Merge de proyectos: los que tienen requisiciones Y/O compras reales
    const allProys = [...new Set([...Object.keys(porProy), ...Object.keys(realPorProy)])];
    const filas = allProys.map((pr) => {
      const v = porProy[pr] || { total: 0, uds: 0, reqNums: new Set() };
      return { proyecto: pr, ...v, real: realPorProy[pr] || 0 };
    }).sort((a, b) => (b.total + b.real) - (a.total + a.real));
    const totalMes = filas.reduce((s, f) => s + f.total, 0);
    const maxProy = Math.max(1, ...filas.map((f) => f.total));

    // ── Historial: total por mes de los ultimos 6 meses (todos los proyectos) ──
    const meses = [];
    {
      const [yy, mm] = costosMes.split("-").map(Number);
      for (let i = 5; i >= 0; i--) {
        const d = new Date(yy, (mm - 1) - i, 1);
        meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }
    }
    const totalDe = (mes) => noRechazadas.filter((r) => mesDe(r.fecha) === mes).reduce((s, r) => s + (r.lineas || []).reduce((a, l) => a + (Number(l.precio) || 0) * (Number(l.qty) || 0), 0), 0);
    const histMax = Math.max(1, ...meses.map(totalDe));
    const mesLabel = (mes) => { const [y, m] = mes.split("-"); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("es-HN", { month: "short", year: "2-digit" }); };

    return (
      <div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ flex: "0 1 200px" }}><Input label="Mes de análisis" type="month" value={costosMes} onChange={(e) => setCostosMes(e.target.value || new Date().toISOString().slice(0, 7))} /></div>
          <div style={{ background: BRAND.blueSoft, border: `1px solid ${BRAND.blue}30`, borderRadius: R.md, padding: "9px 14px", fontSize: 12, color: BRAND.ink, flex: 1, minWidth: 260 }}>
            💰 Gasto de EPP <b>cargado a cada proyecto</b> según las requisiciones del mes (pendientes, aprobadas y entregadas — las rechazadas no cuentan). Las líneas viejas sin proyecto caen en <b>SIN PROYECTO</b>.
          </div>
        </div>

        {/* KPIs del mes */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 16 }}>
          <div style={{ background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.lg, padding: "14px 16px" }}>
            <div style={{ fontSize: 10.5, color: BRAND.stone, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Comprometido (requisiciones)</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: GREEN, marginTop: 3 }}>{fmtL(totalMes)}</div>
            <div style={{ fontSize: 10, color: BRAND.stone, marginTop: 2 }}>precios de catálogo</div>
          </div>
          <div style={{ background: "#fff", border: `1px solid ${BRAND.green}50`, borderRadius: R.lg, padding: "14px 16px" }}>
            <div style={{ fontSize: 10.5, color: "#3D5F35", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Comprado REAL (POs recibidas)</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#166534", marginTop: 3 }}>{fmtL(totalRealMes)}</div>
            <div style={{ fontSize: 10, color: "#3D5F35", marginTop: 2 }}>precios reales de factura</div>
          </div>
          <div style={{ background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.lg, padding: "14px 16px" }}>
            <div style={{ fontSize: 10.5, color: BRAND.stone, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Proyectos con gasto</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: BRAND.charcoal, marginTop: 3 }}>{filas.length}</div>
          </div>
          <div style={{ background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.lg, padding: "14px 16px" }}>
            <div style={{ fontSize: 10.5, color: BRAND.stone, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Requisiciones del mes</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: BRAND.charcoal, marginTop: 3 }}>{delMes.length}</div>
          </div>
        </div>

        {/* Tabla por proyecto */}
        <div style={{ background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.lg, overflow: "hidden", boxShadow: BRAND.shadowSm, marginBottom: 16 }}>
          <div style={{ padding: "11px 16px", borderBottom: `1px solid ${BRAND.borderSoft}`, fontWeight: 800, fontSize: 13.5, color: BRAND.charcoal }}>🏗 Gasto por proyecto — {mesLabel(costosMes)}</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: BRAND.beigeLight }}><th style={th}>Proyecto</th><th style={{ ...th, textAlign: "right" }}>Unidades</th><th style={{ ...th, textAlign: "right" }}>Requisiciones</th><th style={{ ...th, textAlign: "right" }}>Comprometido</th><th style={{ ...th, textAlign: "right" }}>Real (POs)</th><th style={{ ...th, minWidth: 140 }}>Peso del mes</th></tr></thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.proyecto}>
                    <td style={{ ...td, fontWeight: 800, color: f.proyecto === "SIN PROYECTO" ? BRAND.stone : BRAND.orange }}>{f.proyecto}</td>
                    <td style={{ ...td, textAlign: "right" }}>{f.uds}</td>
                    <td style={{ ...td, textAlign: "right" }}>{f.reqNums.size}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 800, color: GREEN }}>{fmtL(f.total)}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 800, color: f.real ? "#166534" : BRAND.stone }}>{f.real ? fmtL(f.real) : "—"}</td>
                    <td style={td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 7, background: BRAND.beigeLight, borderRadius: 4, overflow: "hidden", minWidth: 70 }}>
                          <div style={{ width: `${(f.total / maxProy) * 100}%`, height: "100%", background: BRAND.orange }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: BRAND.graphite, minWidth: 34, textAlign: "right" }}>{totalMes > 0 ? Math.round((f.total / totalMes) * 100) : 0}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filas.length && <tr><td style={{ ...td, textAlign: "center", color: BRAND.stone, padding: 30 }} colSpan={6}>Sin requisiciones ni compras en {mesLabel(costosMes)}.</td></tr>}
              </tbody>
              {filas.length > 0 && <tfoot><tr style={{ background: BRAND.beigeLight }}>
                <td style={{ ...td, fontWeight: 800 }}>TOTAL</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{filas.reduce((s, f) => s + f.uds, 0)}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{delMes.length}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 800, color: GREEN }}>{fmtL(totalMes)}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 800, color: "#166534" }}>{fmtL(totalRealMes)}</td>
                <td style={td}></td>
              </tr></tfoot>}
            </table>
          </div>
        </div>

        {/* Historial 6 meses */}
        <div style={{ background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.lg, overflow: "hidden", boxShadow: BRAND.shadowSm }}>
          <div style={{ padding: "11px 16px", borderBottom: `1px solid ${BRAND.borderSoft}`, fontWeight: 800, fontSize: 13.5, color: BRAND.charcoal }}>📈 Últimos 6 meses (todos los proyectos)</div>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-end", padding: "18px 20px 14px", overflowX: "auto" }}>
            {meses.map((mes) => {
              const t = totalDe(mes);
              const hPct = Math.max(4, Math.round((t / histMax) * 100));
              const activo = mes === costosMes;
              return (
                <div key={mes} onClick={() => setCostosMes(mes)} title={fmtL(t)} style={{ flex: 1, minWidth: 64, cursor: "pointer", textAlign: "center" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: activo ? BRAND.orange : BRAND.graphite, marginBottom: 4 }}>{t > 0 ? fmtL(t) : "—"}</div>
                  <div style={{ height: 90, display: "flex", alignItems: "flex-end" }}>
                    <div style={{ width: "100%", height: `${hPct}%`, background: activo ? BRAND.orange : "#E4CDB8", borderRadius: "6px 6px 0 0", transition: "height .2s" }} />
                  </div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: activo ? BRAND.orange : BRAND.stone, marginTop: 5, textTransform: "capitalize" }}>{mesLabel(mes)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // ══════════════════════════ LAYOUT ══════════════════════════
  const TABS = [
    { id: "catalogo", label: "🛒 Catálogo" },
    { id: "requisiciones", label: "📋 Requisiciones", badge: reqsPendientes },
    { id: "porcomprar", label: "🧾 Por comprar", badge: posAbiertas, badgeColor: "#B45309" },
    { id: "costos", label: "💰 Costos" },
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
            {sec === "porcomprar" && renderPorComprar()}
            {sec === "costos" && renderCostos()}
            {sec === "dotacion" && renderDotacion()}
            {sec === "inventario" && renderInventario()}
            {sec === "proveedores" && renderProveedores()}
            {sec === "descuentos" && renderDescuentos()}
          </>
        )}
      </div>

      {/* Paisaje decorativo: la BG-20 y el equipo con su EPP (igual en todos los apartados) */}
      <GeoSafetyScene />

      {/* Footer de créditos */}
      <div style={{ textAlign: "center", padding: "16px 20px 22px", fontSize: 11.5, color: BRAND.ash, borderTop: `1px solid ${BRAND.borderSoft}`, background: "#F5EFE3" }}>
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
      {modal?.t === "req-edit" && (
        <Modal title={`✏️ Editar requisición ${modal.req.numero}`} onClose={() => setModal(null)} width={860}>
          <EditReqFormImpl req={modal.req} people={people} projOptions={projOptions}
            onCancel={() => setModal(null)}
            onSave={async (lineas) => {
              const ok = await saveReqEdit(modal.req.id, lineas);
              if (ok) { setModal(null); alert(`✅ ${modal.req.numero} actualizada.`); }
            }} />
        </Modal>
      )}
      {modal?.t === "po-new" && (
        <Modal title="🧾 Nueva orden — Por comprar" onClose={() => setModal(null)} width={720}>
          <PoFormImpl items={items} providers={providers}
            onCancel={() => setModal(null)}
            onSave={async (lines) => {
              const po = await crearPo(lines, "");
              if (po) { setModal(null); alert(`✅ ${po.numero} creada. Generá el PDF para el proveedor.`); }
            }} />
        </Modal>
      )}
      {modal?.t === "po-recibo" && (
        <Modal title={`📦 Recepción de ${modal.po.numero} — cantidades y precios reales`} onClose={() => setModal(null)} width={760}>
          <PoReciboFormImpl po={modal.po} items={items}
            onCancel={() => setModal(null)}
            onSave={async (linesRecibidas, { sumarStock, actualizarPrecios }) => {
              const totalReal = linesRecibidas.reduce((s, l) => s + l.precioReal * l.cantRecibida, 0);
              // 1) PO → recibida, con lineas actualizadas y total real
              const ok = await sPos(pos.map((x) => (x.id === modal.po.id
                ? { ...x, estado: "recibida", recibidaAt: new Date().toISOString(), recibidaPor: userName, lines: linesRecibidas, totalReal }
                : x)));
              if (!ok) return;
              // 2) Stock + precios del catalogo en UN solo save (evita doble write)
              if (sumarStock || actualizarPrecios) {
                const porItem = {};
                linesRecibidas.forEach((l) => {
                  if (!l.itemId) return;
                  if (!porItem[l.itemId]) porItem[l.itemId] = { cant: 0, precio: l.precioReal };
                  porItem[l.itemId].cant += l.cantRecibida;
                  porItem[l.itemId].precio = l.precioReal; // ultimo precio real gana
                });
                const ni = items.map((it) => {
                  const rec = porItem[it.id];
                  if (!rec) return it;
                  return {
                    ...it,
                    ...(sumarStock ? { stock: (Number(it.stock) || 0) + rec.cant } : {}),
                    ...(actualizarPrecios ? { precio: rec.precio } : {}),
                  };
                });
                const ok2 = await sItems(ni);
                if (!ok2) alert("⚠ La orden quedó RECIBIDA pero el stock/precios del catálogo NO se actualizaron. Ajustalos en Inventario.");
              }
              setModal(null);
              alert(`✅ ${modal.po.numero} recibida. Total real: ${fmtL(totalReal)}.` + (sumarStock ? "\n📦 Unidades sumadas al stock del almacén." : ""));
            }} />
        </Modal>
      )}
      {modal?.t === "ficha" && FichaModal({ empId: modal.empId })}
    </div>
  );
}
