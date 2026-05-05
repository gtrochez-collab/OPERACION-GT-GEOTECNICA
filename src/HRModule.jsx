import { useState, useEffect } from "react";
import { store } from "./supabase.js";
import Logo from "./Logo.jsx";
import { PROJECTS as CANONICAL_PROJECTS, findProject, resolveShort, projectName, projectCode } from "./projects.js";
import { esFeriadoQuincena, nombreFeriado } from "./holidays.js";

// Marca Geotecnica — colores corporativos
const ORANGE = "#E8762D";
const ORANGE_DARK = "#C75F1F";
const BEIGE = "#F5F0E8";
const CREAM = "#FFFBF5";
const PARCHMENT = "#F8F2E6";
const DARK_BG = "#1F1B17";
const DARK_SURFACE = "#2A2520";
const DARK_BORDER = "#3D3530";
const CHARCOAL = "#2C2A28";
const STONE = "#8B847C";
const BORDER = "#DBD4C8";

const COMPANIES = {
  subterra: { name: "Subterra Honduras", color: "#3E6A99", accent: "#5A8AB8" },
  geotecnica: { name: "Geotecnica Soluciones", color: "#2C5F5D", accent: "#3D8580" },
};
const DEPARTMENTS = ["Administracion", "Ingenieria", "Operaciones", "Logistica", "RRHH", "Contabilidad", "Campo", "Mecanica"];
const LEAVE_TYPES = ["Personal", "Medico", "Duelo", "Maternidad", "Paternidad", "Sin goce de sueldo", "Otro"];
// Lista canonica unificada con Operations CC y Compras (src/projects.js).
// Mantiene aliases para retrocompatibilidad con cuadrillas/asistencias
// guardadas con shorts viejos (ej: "VILLA ROY" → "VILLAROY").
const PROJECTS = CANONICAL_PROJECTS;
const PROJ_SHORTS = PROJECTS.map((p) => p.short);
const projLabel = (short) => {
  const p = findProject(short);
  return p ? `[${p.code}] ${p.name}` : short;
};
const projShort = (short) => resolveShort(short);
const DAYS_ES = ["D", "L", "M", "M", "J", "V", "S"];

// ── Grupos para reportes de altas/bajas ──
// A = Permanentes Subterra | B = Temporales Subterra | C = Permanentes Geotecnica | D = Honorarios
const getGrupo = (company, contractType) => {
  if (contractType === "honorarios") return "D";
  if (company === "subterra") return contractType === "permanent" ? "A" : "B";
  if (company === "geotecnica") return contractType === "permanent" ? "C" : "B";
  return "—";
};
const GRUPO_DESC = { A: "Permanentes Subterra", B: "Temporales Subterra", C: "Permanentes Geotecnica", D: "Honorarios" };
const GRUPO_COLOR = { A: "#0F4C75", B: "#D97706", C: "#1B4332", D: "#7C3AED" };
const MOTIVOS_ALTA = ["Contratacion nueva", "Reingreso", "Cambio de empresa", "Conversion temporal a permanente", "Otro"];
const MOTIVOS_BAJA = ["Renuncia voluntaria", "Despido", "Fin de contrato temporal", "Mutuo acuerdo", "Jubilacion", "Fallecimiento", "Otro"];

// Devuelve la quincena (1Q/2Q) y periodo (YYYY-MM) de una fecha
const getQuincena = (dateStr) => {
  if (!dateStr) return { periodo: "", quincena: "" };
  const d = new Date(dateStr);
  const periodo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const quincena = d.getDate() <= 15 ? "1Q" : "2Q";
  return { periodo, quincena };
};

// ── Codigo de empleado ──
// Genera codigo: [1ra letra del nombre][1ra letra del 1er apellido][ultimos 5 digitos del DNI]
// Ej: David Hazar Mavet Cruz Valladares · 0801-2003-00715 → DC00715
//     Marlen Liliana Ramos · 0816-1990-00288 → MR00288
//     Daniel Alexander Lopez Servellon · 0801-1995-12345 → DL12345
const genEmpCode = (fullName, dni) => {
  if (!fullName || !dni) return "";
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const firstInitial = (parts[0][0] || "").toUpperCase();
  // Heuristica para identificar el primer apellido en nombres hispanos:
  //   1 palabra: usa la misma letra
  //   2 palabras: la 2da palabra es el apellido
  //   3 palabras: la 3ra palabra (asume "nombre nombre apellido")
  //   4+ palabras: la antepenultima (asume "nombre [nombre] apellido apellido")
  const surnameIdx = parts.length <= 3 ? parts.length - 1 : parts.length - 2;
  const surnameInitial = (parts[surnameIdx][0] || "").toUpperCase();
  const cleanDni = String(dni).replace(/[^\d]/g, "");
  const last5 = cleanDni.slice(-5).padStart(5, "0");
  return `${firstInitial}${surnameInitial}${last5}`;
};

// ── Deduction Calculators ──
const calcRAP = (salarioBruto) => Math.max(0, +(((salarioBruto - 11903.13) * 0.015).toFixed(2)));
const calcISR = (salarioBrutoMensual, bonifMensual, rapMensual, gastosMedicos = 40000) => {
  const ingresoAnual = (salarioBrutoMensual + bonifMensual) * 12;
  const dedMedica = gastosMedicos;
  const dedRAP = rapMensual * 12;
  const dedIVM = 297.58 * 12;
  const rentaNeta = ingresoAnual - dedMedica - dedRAP - dedIVM;
  if (rentaNeta <= 228324.32) return 0;
  let isr = 0;
  if (rentaNeta > 228324.32) isr += Math.min(rentaNeta, 348154.10) * 0.15 - 228324.32 * 0.15;
  if (rentaNeta > 348154.10) isr += (Math.min(rentaNeta, 809660.75) - 348154.10) * 0.20;
  if (rentaNeta > 809660.75) isr += (rentaNeta - 809660.75) * 0.25;
  return +(isr / 12).toFixed(2);
};
const IHSS_AMOUNT = 595.16;

// store is now imported from ./supabase.js (shared Supabase DB)

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = d => d ? new Date(d).toLocaleDateString("es-HN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtL = n => n != null && n !== "" && n !== 0 ? `L ${Number(n).toLocaleString("es-HN", { minimumFractionDigits: 2 })}` : "L 0.00";
const daysBetween = (a, b) => Math.ceil((new Date(b) - new Date(a)) / 86400000) + 1;

// ── Seed data from real planillas 2Q Marzo 2026 ──
const SEED_SUB = [
  // 13 PERMANENTES
  { n: "David Hazar Mavet Cruz Valladares", d: "0801-2003-00715", p: "Tecnico C", ct: "permanent", s: 14455.6, b: 0, sd: "2025-07-01", coop: 0 },
  { n: "Elvin Daniel Juanez Alcerro", d: "0801-1978-04995", p: "Operador de Grua", ct: "permanent", s: 20000, b: 1500, sd: "2025-07-01", coop: 0 },
  { n: "Gustavo David Portillo", d: "0824-2003-00980", p: "Tecnico C", ct: "permanent", s: 14455.6, b: 0, sd: "2025-07-01", coop: 0 },
  { n: "Javier Alexander Gonzales Rueda", d: "0801-2000-02632", p: "Tecnico C", ct: "permanent", s: 14455.6, b: 0, sd: "2025-07-01", coop: 0 },
  { n: "Jose Henry Mejia Polanco", d: "1806-1993-01349", p: "Soldador A", ct: "permanent", s: 19500, b: 0, sd: "2026-01-26", coop: 0 },
  { n: "Jose Isac Garay Garay", d: "0801-2018-13434", p: "Tecnico C", ct: "permanent", s: 14455.6, b: 0, sd: "2025-07-01", coop: 0 },
  { n: "Kevin Isaac Hernandez Lopez", d: "0801-2004-05139", p: "Tecnico C", ct: "permanent", s: 13000, b: 2000, sd: "2025-07-01", coop: 0 },
  { n: "Luis Edilberto Corea Rodriguez", d: "0801-2000-12354", p: "Tecnico C", ct: "permanent", s: 14455.6, b: 0, sd: "2025-07-01", coop: 0 },
  { n: "Marlen Liliana Ramos", d: "0816-1990-00288", p: "Asistente Contable", ct: "permanent", s: 16000, b: 0, sd: "2025-07-01", coop: 0 },
  { n: "Ronald Yahir Arias Navas", d: "0801-2003-00178", p: "Tornero", ct: "permanent", s: 15500, b: 2000, sd: "2025-07-01", coop: 0 },
  { n: "Santos Francisco Ordoñez Almendares", d: "0816-1988-00341", p: "Tecnico C", ct: "permanent", s: 14455.6, b: 2000, sd: "2025-07-01", coop: 0 },
  { n: "Uriel Edgardo Pineda Billalobos", d: "0801-2004-01574", p: "Tecnico C", ct: "permanent", s: 14455.6, b: 0, sd: "2025-07-01", coop: 1356 },
  { n: "Waldo Leonel Galindo Guiza", d: "0801-1999-06384", p: "Tecnico C", ct: "permanent", s: 14455.6, b: 0, sd: "2025-07-01", coop: 0 },
  // 14 TEMPORALES
  { n: "Alejandro Miguel Fonseca Lagos", d: "0801-2002-11647", p: "Asistente Administrativo", ct: "temporary", s: 15000, b: 0, sd: "2026-02-16", ed: "2026-04-30", coop: 0 },
  { n: "Daniel Alexander Lopez Servellon", d: "0801-1998-23225", p: "Tecnico C", ct: "temporary", s: 13000, b: 0, sd: "2026-01-17", ed: "2026-02-17", coop: 0 },
  { n: "Ena Sofia Oliva Medina", d: "1502-1999-00563", p: "Ingeniero de Campo", ct: "temporary", s: 21000, b: 5878, sd: "2025-08-01", ed: "2025-12-31", coop: 0 },
  { n: "Ever Alberto Corea Mejia", d: "0801-2001-12831", p: "Operador de Fiori", ct: "temporary", s: 14000, b: 0, sd: "2025-09-16", ed: "2025-12-31", coop: 0 },
  { n: "Exequiel Antonio Sierra Amador", d: "0816-2002-00083", p: "Tecnico C", ct: "temporary", s: 13000, b: 0, sd: "2026-01-17", ed: "2026-02-17", coop: 0 },
  { n: "Fernando Jesus Diaz Fernandez", d: "0801-2002-20394", p: "Asistente Administrativo", ct: "temporary", s: 18000, b: 2000, sd: "2025-08-16", ed: "2025-12-31", coop: 0 },
  { n: "Ivonne Alejandra Cruz Coello", d: "0801-1989-09104", p: "Ingeniera Asistente Oficina Tecnica", ct: "temporary", s: 25000, b: 0, sd: "2026-03-02", ed: "2026-05-02", coop: 0 },
  { n: "Jose Miguel Rodriguez Medina", d: "0801-1989-13061", p: "Tecnico C", ct: "temporary", s: 14455.6, b: 0, sd: "2025-11-16", ed: "2025-12-31", coop: 1106 },
  { n: "Josue David Tinoco Flores", d: "0801-2003-08328", p: "Tecnico C", ct: "temporary", s: 13000, b: 0, sd: "2026-01-17", ed: "2026-02-17", coop: 0 },
  { n: "Ricardo David Benavides Garcia", d: "0801-1964-00775", p: "Mecanico", ct: "temporary", s: 19000, b: 0, sd: "2025-07-04", ed: "2025-12-31", coop: 0 },
  { n: "Rolando Josue Mendoza Sanchez", d: "0801-2003-08130", p: "Tecnico C", ct: "temporary", s: 13000, b: 0, sd: "2025-12-09", ed: "2025-12-31", coop: 0 },
  { n: "Said Antonio Ortiz Alvarado", d: "0801-2004-03223", p: "Tornero", ct: "temporary", s: 13000, b: 0, sd: "2026-02-16", ed: "2026-04-30", coop: 0 },
  { n: "Yeferson Javier Castillo Hernandez", d: "0801-2007-01751", p: "Tecnico C", ct: "temporary", s: 13000, b: 0, sd: "2025-11-14", ed: "2025-12-31", coop: 0 },
  { n: "Yoni Enmanuel Hernandez Lopez", d: "0801-1992-14955", p: "Operador A", ct: "temporary", s: 18000, b: 2000, sd: "2025-12-03", ed: "2025-12-31", coop: 1256 },
];
const SEED_GEO = [
  { n: "Ariel Jesus Zambrano Inestroza", d: "0801-1994-00147", p: "Jefe de Contabilidad", ct: "permanent", s: 23500, b: 0, sd: "2025-07-01", coop: 0 },
  { n: "David Hernandez Echeverz", d: "0801-1962-04667", p: "Encargado de Proyecto", ct: "permanent", s: 30000, b: 0, sd: "2025-07-01", coop: 0, gm: 70000 },
  { n: "Dennis Antonio Acosta Velasquez", d: "0801-1977-09662", p: "Motorista", ct: "permanent", s: 15000, b: 1000, sd: "2025-07-01", coop: 0 },
  { n: "Edgar Joel Izcano Paz", d: "0801-1987-21807", p: "Operador Senior", ct: "permanent", s: 23000, b: 3000, sd: "2025-07-01", coop: 0 },
  { n: "Elvin Yovani Solis Lopez", d: "0712-1978-00152", p: "Motorista", ct: "permanent", s: 14455.6, b: 4500, sd: "2025-07-01", coop: 0 },
  { n: "Emerson Ariel Vasquez Valladares", d: "0801-1991-24079", p: "Operador C", ct: "permanent", s: 16000, b: 0, sd: "2025-07-01", coop: 0 },
  { n: "Ester Sarai Cruz Molina", d: "0801-2002-12764", p: "Ingeniero Encargado", ct: "permanent", s: 21000, b: 0, sd: "2025-07-04", coop: 0 },
  { n: "Gerson Steve Trochez Cubas", d: "0823-2002-00001", p: "Jefe de RRHH y Operaciones", ct: "permanent", s: 25000, b: 2600, sd: "2026-01-02", coop: 0 },
  { n: "Jorge Arturo Castillo Oliva", d: "0801-1982-12735", p: "Soldadura", ct: "permanent", s: 16000, b: 0, sd: "2025-07-01", coop: 0 },
  { n: "Jose Luis Sanchez", d: "0801-1992-14738", p: "Tecnico A", ct: "permanent", s: 15500, b: 0, sd: "2025-07-01", coop: 1356 },
  { n: "Josue Adonay Izaguirre", d: "0801-1993-19561", p: "Operador A / Capataz", ct: "permanent", s: 19000, b: 0, sd: "2025-07-01", coop: 0 },
  { n: "Josue Manuel Andino Ramirez", d: "0801-1993-08087", p: "Operador C", ct: "permanent", s: 16000, b: 0, sd: "2025-07-01", coop: 0 },
  { n: "Kenia Elizabeth Banegas Zelaya", d: "0801-1992-04970", p: "Asistente Contable", ct: "permanent", s: 20000, b: 0, sd: "2025-07-01", coop: 0 },
  { n: "Kevin Edilberto Guiza Rosales", d: "0801-1998-03949", p: "Operador C", ct: "permanent", s: 16000, b: 0, sd: "2025-07-01", coop: 200 },
  { n: "Kevin Orlando Sanchez Adriano", d: "0801-1999-04877", p: "Operador C", ct: "permanent", s: 20000, b: 2000, sd: "2025-07-01", coop: 0 },
  { n: "Luis Carlos Sanchez", d: "0801-2003-14105", p: "Operador C", ct: "permanent", s: 16000, b: 0, sd: "2025-07-01", coop: 0 },
  { n: "Magdiel Omar Tercero Calix", d: "0801-1995-05708", p: "Coordinador Mecanica", ct: "permanent", s: 26000, b: 0, sd: "2025-08-01", coop: 0 },
  { n: "Mario Roberto Pereira Armijo", d: "0801-1990-10835", p: "Operador C / Tecnico A", ct: "permanent", s: 17000, b: 1000, sd: "2025-07-01", coop: 0 },
  { n: "Marvin Efrain Zelaya Cardenas", d: "0801-1987-00252", p: "Operador B", ct: "permanent", s: 19000, b: 1000, sd: "2025-07-01", coop: 0 },
  { n: "Nacho Sanchez Rodriguez", d: "0712-1981-00493", p: "Tecnico A", ct: "permanent", s: 16000, b: 0, sd: "2025-07-01", coop: 0 },
  { n: "Neftali Gonzales Rios", d: "0801-1996-17372", p: "Asistente Ingenieria (Dibujante)", ct: "permanent", s: 22674, b: 3840, sd: "2025-07-01", coop: 0 },
  { n: "Nelson Alonzo Lopez Valladares", d: "0801-1986-00113", p: "Capataz", ct: "permanent", s: 17000, b: 0, sd: "2025-07-01", coop: 1056 },
  { n: "Osue Edgardo Pineda Quiroz", d: "0801-1983-14247", p: "Ayudante A - Perf. Aprendiz", ct: "permanent", s: 20000, b: 3000, sd: "2025-07-01", coop: 1156 },
  { n: "Teofilo Velasquez Rubi", d: "0807-1969-00010", p: "Operador Bomba Concreto", ct: "permanent", s: 16000, b: 0, sd: "2025-07-01", coop: 0 },
  { n: "Ubaldo Hernandez Pineda", d: "1608-1981-00087", p: "Tecnico A", ct: "permanent", s: 16000, b: 0, sd: "2025-07-01", coop: 1056 },
  { n: "Ubaldo Damian Armijo Alonzo", d: "0824-1976-00502", p: "Asistente Adm. Mecanica", ct: "permanent", s: 16000, b: 800, sd: "2025-07-01", coop: 0 },
  { n: "Yeferson Ariel Andino Ramirez", d: "0801-1997-06996", p: "Operador C", ct: "permanent", s: 16000, b: 0, sd: "2025-07-01", coop: 0 },
  { n: "Allan Said Oyuela Martinez", d: "0807-1991-00015", p: "Ingeniero Encargado", ct: "honorarios", s: 23500, b: 0, sd: "2025-07-04", coop: 0 },
];

// ── UI ──
const Badge = ({ children, color = "#64748b" }) => <span style={{ background: color + "18", color, padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{children}</span>;
const Btn = ({ children, onClick, variant = "primary", small, style: sx, disabled }) => {
  const b = { border: "none", borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer", fontWeight: 600, fontSize: small ? 12 : 14, padding: small ? "5px 12px" : "9px 20px", opacity: disabled ? 0.5 : 1, fontFamily: "inherit", letterSpacing: 0.2 };
  const v = {
    primary: { ...b, background: "#E8762D", color: "#fff", boxShadow: "0 2px 6px rgba(232,118,45,0.20)" },
    success: { ...b, background: "#5A8A4F", color: "#fff" },
    danger: { ...b, background: "#C0392B", color: "#fff" },
    info: { ...b, background: "#2C5F5D", color: "#fff" },
    ghost: { ...b, background: "transparent", color: "#5C5853", border: "1px solid #DBD4C8" },
  };
  return <button style={{ ...(v[variant] || v.primary), ...sx }} onClick={onClick} disabled={disabled}>{children}</button>;
};
const Input = ({ label, ...p }) => <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{label && <label style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>{label}</label>}<input style={{ padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 14, outline: "none", background: "#F8FAFC" }} {...p} /></div>;
const Select = ({ label, options, ...p }) => <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{label && <label style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>{label}</label>}<select style={{ padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 14, background: "#F8FAFC" }} {...p}><option value="">—</option>{options.map(o => <option key={typeof o === "string" ? o : o.value} value={typeof o === "string" ? o : o.value}>{typeof o === "string" ? o : o.label}</option>)}</select></div>;
const Modal = ({ title, onClose, children, wide }) => <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}><div style={{ background: "#fff", borderRadius: 16, padding: 28, width: wide ? "95vw" : 520, maxWidth: "98vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }} onClick={e => e.stopPropagation()}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}><h3 style={{ margin: 0, fontSize: 18 }}>{title}</h3><button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94A3B8" }}>✕</button></div>{children}</div></div>;
const Table = ({ columns, data, actions }) => <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid #E2E8F0" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}><thead><tr style={{ background: "#F1F5F9" }}>{columns.map(c => <th key={c.key} style={{ padding: "10px 14px", textAlign: "left", color: "#475569", fontWeight: 600, borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap" }}>{c.label}</th>)}{actions && <th style={{ padding: "10px 14px", textAlign: "right", borderBottom: "2px solid #E2E8F0" }}>Acciones</th>}</tr></thead><tbody>{data.length === 0 && <tr><td colSpan={columns.length + (actions ? 1 : 0)} style={{ padding: 30, textAlign: "center", color: "#94A3B8" }}>Sin registros</td></tr>}{data.map((r, i) => <tr key={r.id || i} style={{ borderBottom: "1px solid #F1F5F9" }}>{columns.map(c => <td key={c.key} style={{ padding: "10px 14px", color: "#334155" }}>{c.render ? c.render(r) : r[c.key]}</td>)}{actions && <td style={{ padding: "10px 14px", textAlign: "right" }}>{actions(r)}</td>}</tr>)}</tbody></table></div>;
const StatCard = ({ label, value, icon, color = "#0F4C75" }) => <div style={{ background: "#fff", borderRadius: 14, padding: "18px 22px", border: "1px solid #E2E8F0", flex: 1, minWidth: 150 }}><div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ background: color + "15", color, width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{icon}</div><div><div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div><div style={{ fontSize: 12, color: "#64748b" }}>{label}</div></div></div></div>;

const TH = { padding: "8px 10px", textAlign: "left", color: "#475569", fontWeight: 600, borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap", fontSize: 11 };
const TD = { padding: "6px 10px", color: "#334155", whiteSpace: "nowrap" };
const INP = { width: 75, padding: "4px 6px", border: "1px solid #E2E8F0", borderRadius: 6, fontSize: 12, textAlign: "right", background: "#F8FAFC" };

// ── APP ──
export default function HRModule({ userRole = "admin", userName, onBack, onLogout }) {
  const isAsistente = userRole === "asistente";
  const isReadOnly = userRole === "gerencia" || userRole === "costos";
  const [co, setCo] = useState("subterra");
  const [sec, setSec] = useState(isAsistente ? "attendance" : "dashboard");
  const [emps, setEmps] = useState([]);
  const [vacs, setVacs] = useState([]);
  const [lvs, setLvs] = useState([]);
  const [atts, setAtts] = useState([]);
  const [cons, setCons] = useState([]);
  const [pays, setPays] = useState([]);
  const [cuadrillas, setCuadrillas] = useState([]);
  const [movs, setMovs] = useState([]);
  const [movsFilter, setMovsFilter] = useState({ periodo: "", quincena: "" });
  const [loaded, setLoaded] = useState(false);
  const [modal, setModal] = useState(null);
  const [sb, setSb] = useState(true);

  useEffect(() => {
    (async () => {
      const [e, v, l, a, c, p, cq2, mv] = await Promise.all([
        store.get("hr-emps5"), store.get("hr-vacs"), store.get("hr-lvs"),
        store.get("hr-atts2"), store.get("hr-cons"), store.get("hr-pays"), store.get("hr-cuad"),
        store.get("hr-movs"),
      ]);
      if (!e || e.length === 0) {
        const s = [];
        SEED_SUB.forEach(x => s.push({ id: uid(), company: "subterra", fullName: x.n, dni: x.d, position: x.p, department: "Operaciones", contractType: x.ct, startDate: x.sd, endDate: x.ed || "", salary: x.s, bonificacion: x.b, cooperativa: x.coop || 0, gastosMedicos: x.gm || 40000, status: "active", phone: "", email: "" }));
        SEED_GEO.forEach(x => s.push({ id: uid(), company: "geotecnica", fullName: x.n, dni: x.d, position: x.p, department: "Operaciones", contractType: x.ct, startDate: x.sd, endDate: x.ed || "", salary: x.s, bonificacion: x.b, cooperativa: x.coop || 0, gastosMedicos: x.gm || 40000, status: "active", phone: "", email: "" }));
        setEmps(s); store.set("hr-emps5", s);
      } else setEmps(e);
      if (v) setVacs(v); if (l) setLvs(l); if (a) setAtts(a); if (c) setCons(c); if (p) setPays(p); if (cq2) setCuadrillas(cq2); if (mv) setMovs(mv);
      setLoaded(true);
    })();
  }, []);

  const sE = d => { setEmps(d); store.set("hr-emps5", d); };
  const sV = d => { setVacs(d); store.set("hr-vacs", d); };
  const sL = d => { setLvs(d); store.set("hr-lvs", d); };
  const sA = d => { setAtts(d); store.set("hr-atts2", d); };
  const sC = d => { setCons(d); store.set("hr-cons", d); };
  const sP = d => { setPays(d); store.set("hr-pays", d); };
  const sCq = d => { setCuadrillas(d); store.set("hr-cuad", d); };
  const sM = d => { setMovs(d); store.set("hr-movs", d); };

  const ce = emps.filter(e => e.company === co);
  const ae = ce.filter(e => e.status === "active");
  const cv = vacs.filter(v => ce.some(e => e.id === v.employeeId));
  const cl = lvs.filter(l => ce.some(e => e.id === l.employeeId));
  const ca = atts.filter(a => a.company === co);
  const cq = cuadrillas.filter(q => q.company === co);
  const cc2 = cons.filter(c => ce.some(e => e.id === c.employeeId));
  const cp = pays.filter(p => p.company === co);
  const cmov = movs.filter(m => m.company === co);
  const en = id => emps.find(e => e.id === id)?.fullName || "—";
  const cc = COMPANIES[co];

  const allNav = [
    { id: "dashboard", icon: "📊", label: "Dashboard" },
    { id: "employees", icon: "👥", label: "Empleados" },
    { id: "payroll", icon: "💰", label: "Planilla" },
    { id: "vacations", icon: "🏖️", label: "Vacaciones" },
    { id: "leaves", icon: "📋", label: "Permisos" },
    { id: "attendance", icon: "⏱️", label: "Asistencia" },
    { id: "movimientos", icon: "🔄", label: "Movimientos" },
    { id: "constancias", icon: "📄", label: "Constancias" },
  ];
  const nav = isAsistente ? allNav.filter(n => n.id === "attendance") : allNav;

  if (!loaded) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'Segoe UI', sans-serif", color: "#64748b" }}>Cargando RRHH...</div>;

  // ── FORMS ──
  const EmpForm = ({ emp, onSave }) => {
    const [f, setF] = useState(emp || { company: co, fullName: "", dni: "", position: "", department: "", contractType: "permanent", startDate: "", endDate: "", salary: "", bonificacion: 0, status: "active", phone: "", email: "" });
    const u = (k, v) => setF(p => ({ ...p, [k]: v }));
    return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <Input label="Nombre completo" value={f.fullName} onChange={e => u("fullName", e.target.value)} />
      <Input label="DNI" value={f.dni} onChange={e => u("dni", e.target.value)} />
      <Input label="Cargo" value={f.position} onChange={e => u("position", e.target.value)} />
      <Select label="Departamento" options={DEPARTMENTS} value={f.department} onChange={e => u("department", e.target.value)} />
      <Select label="Contrato" options={[{ value: "permanent", label: "Permanente" }, { value: "temporary", label: "Temporal" }, { value: "honorarios", label: "Honorarios" }]} value={f.contractType} onChange={e => u("contractType", e.target.value)} />
      <Select label="Estado" options={[{ value: "active", label: "Activo" }, { value: "inactive", label: "Inactivo" }]} value={f.status} onChange={e => u("status", e.target.value)} />
      <Input label="Fecha inicio" type="date" value={f.startDate} onChange={e => u("startDate", e.target.value)} />
      {f.contractType === "temporary" && <Input label="Fecha fin" type="date" value={f.endDate} onChange={e => u("endDate", e.target.value)} />}
      <Input label="Salario bruto (L)" type="number" value={f.salary} onChange={e => u("salary", e.target.value)} />
      <Input label="Bonificacion (L)" type="number" value={f.bonificacion || 0} onChange={e => u("bonificacion", e.target.value)} />
      <div style={{ gridColumn: "1/-1", display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
        <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
        <Btn variant="success" onClick={() => { if (!f.fullName) return alert("Nombre requerido"); onSave({ ...f, id: f.id || uid(), company: f.company || co }); setModal(null); }}>{emp ? "Guardar" : "Agregar"}</Btn>
      </div>
    </div>;
  };

  // ── PAYROLL GENERATOR ──
  // ── Export helpers (used by PayrollGen and PayDetail) ──
  const exportCSV = (rows, filename) => {
    const fN = n => Number(n || 0).toFixed(2);
    const headers = ["Nombre","Cargo","Tipo","Proyecto","Sal.Bruto","Sal.Diario","Dias","NSP","Desc.NSP","Sal.Ordinario","Dom.Trab","Bono Domingo","Bonif.Q","Otros Ing.","ISR","IHSS","RAP","Cooperativa","Otros Ded.","Total Ded.","Neto","Notas"];
    const csv = [headers.join(","), ...rows.map(l => ['"'+l.name+'"','"'+l.pos+'"',l.ct==="permanent"?"PMNT":l.ct==="temporary"?"TMPR":"HON",'"'+(l.proj||"")+'"',fN(l.sb),fN(l.sd),l.diasPresente||0,l.diasNSP||0,fN(l.descuentoNSP),fN(l.so),l.domTrab||0,fN(l.bonoDomingo||0),fN(l.bq),fN(l.o1),fN(l.isr),fN(l.ihss),fN(l.rap),fN(l.coop),fN(l.otros),fN(l.tDed||0),fN(l.neto||0),'"'+(l.nota||"")+'"'].join(","))].join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent("\uFEFF" + csv);
    a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };
  const exportPrint = (rows, titulo, subtitulo, totalNeto) => {
    const fL = n => "L " + Number(n || 0).toLocaleString("es-HN", { minimumFractionDigits: 2 });
    const trs = rows.map(l => "<tr><td>"+l.name+"</td><td>"+l.pos+"</td><td>"+(l.proj||"")+"</td><td style='text-align:right'>"+fL(l.sb)+"</td><td>"+(l.diasPresente||0)+"</td><td style='color:red'>"+(l.diasNSP||0)+"</td><td style='text-align:right'>"+fL(l.so)+"</td><td style='text-align:center;color:purple;font-weight:bold'>"+(l.domTrab||"")+"</td><td style='text-align:right;color:purple'>"+((l.bonoDomingo||0)>0?fL(l.bonoDomingo):"")+"</td><td style='text-align:right'>"+fL(l.isr)+"</td><td style='text-align:right'>"+fL(l.ihss)+"</td><td style='text-align:right'>"+fL(l.rap)+"</td><td style='text-align:right'>"+fL(l.coop)+"</td><td style='text-align:right;font-weight:bold;color:green'>"+fL(l.neto||0)+"</td><td>"+(l.nota||"")+"</td></tr>").join("");
    const w = window.open("","_blank");
    if(!w){alert("Permite popups para imprimir");return;}
    w.document.write("<!DOCTYPE html><html><head><meta charset='utf-8'><title>"+titulo+"</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;padding:30px}table{border-collapse:collapse;width:100%;margin-top:15px}th,td{border:1px solid #ccc;padding:5px 8px;font-size:10px}th{background:#eee}@media print{.np{display:none}}</style></head><body>");
    w.document.write("<h1 style='font-size:20px'>"+titulo+"</h1><h2 style='font-size:13px;color:#666'>"+subtitulo+"</h2><p style='font-size:16px;font-weight:bold;margin:12px 0'>Total Neto: "+fL(totalNeto)+" | "+rows.length+" empleados</p>");
    w.document.write("<table><thead><tr><th>Nombre</th><th>Cargo</th><th>Proy.</th><th>Sal.Bruto</th><th>Dias</th><th>NSP</th><th>Sal.Ord.</th><th style='color:purple'>DOM</th><th style='color:purple'>Bono Dom.</th><th>ISR</th><th>IHSS</th><th>RAP</th><th>Coop.</th><th>Neto</th><th>Notas</th></tr></thead><tbody>"+trs+"</tbody></table>");
    w.document.write("<br><button class='np' onclick='window.print()' style='padding:10px 24px;font-size:14px;cursor:pointer;background:#059669;color:white;border:none;border-radius:8px'>Imprimir / Guardar como PDF</button></body></html>");
    w.document.close();
  };

  const PayrollGen = () => {
    const [per, setPer] = useState("");
    const [q, setQ] = useState("2Q");
    const [lines, setLines] = useState([]);
    const [gen, setGen] = useState(false);

    const is2Q = q === "2Q";

    const generate = () => {
      if (!per) return alert("Seleccione periodo");
      const attSheet = ca.find(a => a.periodo === per && a.quincena === q);
      const grid = attSheet?.grid || {};
      const projOvr = attSheet?.projOverrides || {};

      const [y, m] = per.split("-").map(Number);
      const start = q === "1Q" ? 1 : 16;
      const lastDay = new Date(y, m, 0).getDate();
      const end = q === "1Q" ? 15 : lastDay;
      const totalDays = end - start + 1;

      const cuad = cq.find(x => x.periodo === per && x.quincena === q);

      // Empleados a incluir en planilla: todos los de la empresa que tuvieron
      // ALGUN dia dentro de la quincena (incluye gente activa, ALTAS de mitad
      // de quincena, BAJAS de mitad de quincena).
      const periodStart = `${per}-${String(start).padStart(2, "0")}`;
      const periodEnd = `${per}-${String(end).padStart(2, "0")}`;
      const payrollEmps = ce.filter((e) => {
        // Si nunca empezo (sin startDate) lo incluimos solo si esta activo
        if (!e.startDate) return e.status === "active";
        // Si su startDate es DESPUES del fin de quincena → no aplica
        if (e.startDate > periodEnd) return false;
        // Si tiene endDate y es ANTES del inicio de quincena → no aplica
        if (e.endDate && e.endDate < periodStart) return false;
        return true;
      });

      setLines(payrollEmps.map(emp => {
        const sb = Number(emp.salary) || 0;
        const bn = Number(emp.bonificacion) || 0;
        const cp = Number(emp.cooperativa) || 0;
        const gm = Number(emp.gastosMedicos) || 40000;
        const sd = +(sb / 30).toFixed(2);
        const isHon = emp.contractType === "honorarios";
        const isPerm = emp.contractType === "permanent";
        const isGeo = emp.company === "geotecnica";

        // Proyecto base de la cuadrilla (para empleados sin overrides)
        const baseProjRaw = cuad?.assignments?.[emp.id] || emp.project || "";
        const baseProj = resolveShort(baseProjRaw);

        // Recorrer dias de la quincena respetando alta/baja
        let diasPresente = 0, diasNSP = 0, diasIncap = 0, domTrab = 0, ferTrab = 0;
        let diasFueraRango = 0;
        const projDays = {}; // { proj_short: dias_trabajados }
        for (let d = start; d <= end; d++) {
          const dStr = `${per}-${String(d).padStart(2, "0")}`;
          // Bloqueo por fechas de alta / baja
          if ((emp.startDate && dStr < emp.startDate) || (emp.endDate && dStr > emp.endDate)) {
            diasFueraRango++;
            continue;
          }
          const v = grid[`${emp.id}-${d}`] || "";
          const dt = new Date(y, m - 1, d);
          const esDomingo = dt.getDay() === 0;
          const esFeriado = esFeriadoQuincena(per, d);
          if (v === "1") {
            diasPresente++;
            if (esDomingo && !esFeriado) domTrab++;
            if (esFeriado) ferTrab++;
            // Asignar al proyecto del dia (override o base)
            const ovr = projOvr[`${emp.id}-${d}`];
            const projForDay = ovr ? resolveShort(ovr) : baseProj;
            if (projForDay) projDays[projForDay] = (projDays[projForDay] || 0) + 1;
          } else if (v === "0") {
            diasNSP++;
          } else if (v === "INC") {
            diasIncap++;
          }
        }

        // Dias efectivos de la quincena (excluyendo dias fuera de rango por alta/baja)
        const diasEfectivos = totalDays - diasFueraRango;

        // Salario bruto prorrateado: solo paga los dias en rango
        const sbProrated = +(sd * diasEfectivos).toFixed(2);
        const descuentoNSP = +(diasNSP * sd).toFixed(2);
        const bonoDomingo = +(domTrab * sd).toFixed(2);
        // Politica Geotecnica: feriado trabajado = +2 dias adicionales sobre el salario base
        const bonoFeriado = +(ferTrab * sd * 2).toFixed(2);

        // Salario ordinario: bruto prorrateado menos descuento por NSP
        const so = +(sbProrated - descuentoNSP).toFixed(2);

        // Bonificacion quincenal: SIEMPRE bono_mensual / 2.
        // Politica Geotecnica: las faltas (NSP) se descuentan del salario, no
        // del bono. El bono no se prorratea por dias de asistencia.
        const bq = +(bn / 2).toFixed(2);

        let ihss = 0, rap = 0, isr = 0;
        if (is2Q && !isHon) {
          ihss = IHSS_AMOUNT;
          if (isGeo && isPerm) rap = calcRAP(sb);
        }
        if (isHon && is2Q) {
          isr = +((sb / 2) * 0.125).toFixed(2);
          ihss = 0;
        }

        return {
          id: uid(),
          eid: emp.id,
          name: emp.fullName,
          pos: emp.position,
          ct: emp.contractType,
          proj: baseProj,
          projDays,            // Distribucion de dias por proyecto (overrides aplicados)
          diasFueraRango,
          diasEfectivos,
          sb,
          bn,
          sd,
          so,
          bq,
          diasPresente,
          diasNSP,
          diasIncap,
          descuentoNSP,
          domTrab,
          bonoDomingo,
          ferTrab,
          bonoFeriado,
          o1: 0,
          o2: 0,
          isr,
          amdc: 0,
          ihss,
          rap,
          coop: is2Q ? cp : 0,
          aus: 0,
          otros: 0,
          gm,
          nota: "",
          payrollVersion: 2,
        };
      }));
      setGen(true);
    };

    const ul = (id, k, v) => setLines(ls => ls.map(l => l.id === id ? { ...l, [k]: v } : l));
    const calc = l => {
      const bd = +(l.bonoDomingo || 0);
      const bf = +(l.bonoFeriado || 0);
      const tOtros = +l.bq + +l.o1 + +l.o2 + bd + bf;
      const tDed = +l.isr + +l.amdc + +l.ihss + +l.rap + +l.coop + +l.aus + +l.otros;
      return { tOtros: +tOtros.toFixed(2), tDed: +tDed.toFixed(2), neto: +(l.so + tOtros - tDed).toFixed(2), bonoDomingo: bd, bonoFeriado: bf };
    };
    const totalNeto = lines.reduce((s, l) => s + calc(l).neto, 0);
    const permLines = lines.filter(l => l.ct === "permanent");
    const tempLines = lines.filter(l => l.ct === "temporary");
    const honLines = lines.filter(l => l.ct === "honorarios");

    // Distribucion de costos por proyecto — usa projDays (dias trabajados por
    // proyecto, considerando overrides). Si la linea no tiene projDays
    // (planillas viejas pre-versionado), cae al proyecto base.
    const projCosts = {};
    lines.forEach(l => {
      const c = calc(l);
      const projDays = l.projDays || {};
      const totalDaysWorked = Object.values(projDays).reduce((s, d) => s + d, 0);
      if (totalDaysWorked > 0) {
        Object.entries(projDays).forEach(([p, days]) => {
          const share = (c.neto * days) / totalDaysWorked;
          if (!projCosts[p]) projCosts[p] = { neto: 0, count: 0 };
          projCosts[p].neto += share;
          projCosts[p].count++;
        });
      } else {
        // Fallback: si no hay distribucion por dia (planilla vieja o sin asistencia)
        const p = l.proj || "SIN ASIGNAR";
        if (!projCosts[p]) projCosts[p] = { neto: 0, count: 0 };
        projCosts[p].neto += c.neto;
        projCosts[p].count++;
      }
    });

    const hasAttendance = ca.some(a => a.periodo === per && a.quincena === q);

    const renderTable = (rows, label, color) => {
      if (rows.length === 0) return null;
      const subtotal = rows.reduce((s, l) => s + calc(l).neto, 0);
      const sums = { sb: 0, sd: 0, dias: 0, nsp: 0, dNSP: 0, so: 0, dom: 0, bdom: 0, fer: 0, bfer: 0, bq: 0, oi: 0, isr: 0, ihss: 0, rap: 0, coop: 0, otros: 0, tDed: 0, neto: 0 };
      rows.forEach(l => { const c = calc(l); sums.sb += l.sb; sums.so += l.so; sums.dom += (l.domTrab || 0); sums.bdom += (l.bonoDomingo || 0); sums.fer += (l.ferTrab || 0); sums.bfer += (l.bonoFeriado || 0); sums.bq += l.bq; sums.oi += l.o1 + l.o2; sums.dias += l.diasPresente; sums.nsp += l.diasNSP; sums.dNSP += l.descuentoNSP; sums.isr += l.isr; sums.ihss += l.ihss; sums.rap += l.rap; sums.coop += l.coop; sums.otros += l.otros; sums.tDed += c.tDed; sums.neto += c.neto; });
      return <div style={{ borderRadius: 12, border: "1px solid #E2E8F0", overflow: "hidden" }}>
        <div style={{ background: color, color: "#fff", padding: "8px 14px", fontWeight: 700, fontSize: 13, display: "flex", justifyContent: "space-between" }}>
          <span>{label} ({rows.length})</span><span>Subtotal: {fmtL(subtotal)}</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead><tr style={{ background: "#F1F5F9" }}>
              <th style={TH}>#</th><th style={{ ...TH, minWidth: 150 }}>Nombre</th><th style={TH}>Proy.</th>
              <th style={TH}>Sal.Bruto</th><th style={TH}>Sal.Diario</th>
              <th style={TH}>Dias</th><th style={{ ...TH, color: "#DC2626" }}>NSP</th><th style={TH}>Desc.NSP</th>
              <th style={TH}>Sal.Ord.</th>
              <th style={{ ...TH, color: "#7C3AED", background: "#F3E8FF" }}>DOM</th><th style={{ ...TH, color: "#7C3AED", background: "#F3E8FF" }}>Bono Dom.</th>
              <th style={{ ...TH, color: "#9A3412", background: "#FED7AA" }}>FER</th><th style={{ ...TH, color: "#9A3412", background: "#FED7AA" }}>Bono Fer.</th>
              <th style={TH}>Bonif.Q</th><th style={TH}>Otros Ing.</th>
              {is2Q && <><th style={TH}>ISR</th><th style={TH}>IHSS</th><th style={TH}>RAP</th><th style={TH}>Coop.</th></>}
              <th style={TH}>Otros Ded.</th><th style={TH}>Tot.Ded</th><th style={{ ...TH, background: "#ECFDF5" }}>Neto</th><th style={TH}>Notas</th>
            </tr></thead>
            <tbody>{rows.map((l, i) => { const c = calc(l); return <tr key={l.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
              <td style={TD}>{i + 1}</td>
              <td style={{ ...TD, fontWeight: 600 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span>{l.name}</span>
                  {(() => { const emp = ae.find(x => x.id === l.eid) || ce.find(x => x.id === l.eid); return emp ? <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 9, fontWeight: 700, color: "#E8762D", letterSpacing: 0.5 }}>{genEmpCode(emp.fullName, emp.dni)}</span> : null; })()}
                </div>
              </td>
              <td style={TD}><Badge color={cc.color}>{l.proj || "—"}</Badge></td>
              <td style={TD}>{fmtL(l.sb)}</td>
              <td style={TD}>{fmtL(l.sd)}</td>
              <td style={{ ...TD, color: "#059669", fontWeight: 600 }}>{l.diasPresente}</td>
              <td style={{ ...TD, color: l.diasNSP > 0 ? "#DC2626" : "#94A3B8", fontWeight: l.diasNSP > 0 ? 700 : 400 }}>{l.diasNSP}</td>
              <td style={{ ...TD, color: "#DC2626" }}>{l.descuentoNSP > 0 ? fmtL(l.descuentoNSP) : ""}</td>
              <td style={TD}>{fmtL(l.so)}</td>
              <td style={{ ...TD, color: "#7C3AED", fontWeight: 700, background: (l.domTrab || 0) > 0 ? "#F3E8FF" : "transparent" }}>{l.domTrab || ""}</td>
              <td style={{ ...TD, color: "#7C3AED", fontWeight: 600 }}>{(l.bonoDomingo || 0) > 0 ? fmtL(l.bonoDomingo) : ""}</td>
              <td style={{ ...TD, color: "#9A3412", fontWeight: 700, background: (l.ferTrab || 0) > 0 ? "#FED7AA" : "transparent" }}>{l.ferTrab || ""}</td>
              <td style={{ ...TD, color: "#9A3412", fontWeight: 600 }}>{(l.bonoFeriado || 0) > 0 ? fmtL(l.bonoFeriado) : ""}</td>
              <td style={TD}><input type="number" value={l.bq} onChange={e => ul(l.id, "bq", +e.target.value)} style={INP} /></td>
              <td style={TD}><input type="number" value={l.o1} onChange={e => ul(l.id, "o1", +e.target.value)} style={INP} /></td>
              {is2Q && <>
                <td style={TD}><input type="number" value={l.isr} onChange={e => ul(l.id, "isr", +e.target.value)} style={INP} /></td>
                <td style={TD}>{fmtL(l.ihss)}</td>
                <td style={TD}>{l.rap > 0 ? fmtL(l.rap) : ""}</td>
                <td style={TD}><input type="number" value={l.coop} onChange={e => ul(l.id, "coop", +e.target.value)} style={INP} /></td>
              </>}
              <td style={TD}><input type="number" value={l.otros} onChange={e => ul(l.id, "otros", +e.target.value)} style={INP} /></td>
              <td style={{ ...TD, fontWeight: 600, color: "#DC2626" }}>{fmtL(c.tDed)}</td>
              <td style={{ ...TD, fontWeight: 700, color: "#059669" }}>{fmtL(c.neto)}</td>
              <td style={TD}><input value={l.nota} onChange={e => ul(l.id, "nota", e.target.value)} style={{ ...INP, width: 100, textAlign: "left" }} placeholder="..." /></td>
            </tr>; })}</tbody>
            <tfoot><tr style={{ background: "#F1F5F9", fontWeight: 700, fontSize: 11 }}>
              <td colSpan={3} style={{ padding: "8px 10px", textAlign: "right" }}>TOTALES:</td>
              <td style={{ padding: "8px 10px" }}>{fmtL(sums.sb)}</td><td style={{ padding: "8px 10px" }}></td>
              <td style={{ padding: "8px 10px", color: "#059669" }}>{sums.dias}</td>
              <td style={{ padding: "8px 10px", color: "#DC2626" }}>{sums.nsp}</td>
              <td style={{ padding: "8px 10px", color: "#DC2626" }}>{sums.dNSP > 0 ? fmtL(sums.dNSP) : ""}</td>
              <td style={{ padding: "8px 10px" }}>{fmtL(sums.so)}</td>
              <td style={{ padding: "8px 10px", color: "#7C3AED" }}>{sums.dom || ""}</td>
              <td style={{ padding: "8px 10px", color: "#7C3AED" }}>{sums.bdom > 0 ? fmtL(sums.bdom) : ""}</td>
              <td style={{ padding: "8px 10px", color: "#9A3412" }}>{sums.fer || ""}</td>
              <td style={{ padding: "8px 10px", color: "#9A3412" }}>{sums.bfer > 0 ? fmtL(sums.bfer) : ""}</td>
              <td style={{ padding: "8px 10px" }}>{fmtL(sums.bq)}</td>
              <td style={{ padding: "8px 10px" }}>{fmtL(sums.oi)}</td>
              {is2Q && <>
                <td style={{ padding: "8px 10px" }}>{fmtL(sums.isr)}</td>
                <td style={{ padding: "8px 10px" }}>{fmtL(sums.ihss)}</td>
                <td style={{ padding: "8px 10px" }}>{fmtL(sums.rap)}</td>
                <td style={{ padding: "8px 10px" }}>{fmtL(sums.coop)}</td>
              </>}
              <td style={{ padding: "8px 10px" }}>{fmtL(sums.otros)}</td>
              <td style={{ padding: "8px 10px", color: "#DC2626" }}>{fmtL(sums.tDed)}</td>
              <td style={{ padding: "8px 10px", color: "#059669", fontSize: 13 }}>{fmtL(sums.neto)}</td>
              <td></td>
            </tr></tfoot>
          </table>
        </div>
      </div>;
    };

    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 14, alignItems: "end" }}>
        <Input label="Periodo" type="month" value={per} onChange={e => setPer(e.target.value)} />
        <Select label="Quincena" options={[{ value: "1Q", label: "1Q (1-15)" }, { value: "2Q", label: "2Q (16-31)" }]} value={q} onChange={e => setQ(e.target.value)} />
        <Btn onClick={generate} disabled={gen}>Generar</Btn>
      </div>
      {gen && <>
        {!hasAttendance && <div style={{ background: "#FEF3C7", border: "1px solid #F59E0B", borderRadius: 10, padding: 12, fontSize: 13, color: "#92400E" }}>⚠️ No hay asistencia registrada para {q} {per}. Registre asistencia primero.</div>}

        <div style={{ background: "#ECFDF5", border: "1px solid #6EE7B7", borderRadius: 10, padding: 14, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontWeight: 700, color: "#065F46", fontSize: 16 }}>Total Neto: {fmtL(totalNeto)}</span>
          <span style={{ fontSize: 13, color: "#047857" }}>{q} {per} — {cc.name} — {lines.length} empleados {is2Q && "| Deducciones 2Q"}</span>
        </div>

        {Object.keys(projCosts).length > 0 && <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {Object.entries(projCosts).sort((a, b) => b[1].neto - a[1].neto).map(([p, d]) => {
            const pj = PROJECTS.find(x => x.short === p);
            return <div key={p} style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10, padding: "10px 16px", minWidth: 150 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: cc.color }}>{p}</div>
              {pj && <div style={{ fontSize: 9, color: "#94A3B8" }}>[{pj.code}]</div>}
              <div style={{ fontSize: 16, fontWeight: 700, color: "#059669" }}>{fmtL(d.neto)}</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>{d.count} personas</div>
            </div>;
          })}
        </div>}

        {renderTable(permLines, "PERMANENTES", "#2563EB")}
        {renderTable(tempLines, "TEMPORALES", "#D97706")}
        {renderTable(honLines, "HONORARIOS", "#7C3AED")}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn small variant="ghost" onClick={() => { const all = lines.map(l => ({...l, ...calc(l)})); exportCSV(all, `Planilla_${cc.name.replace(/ /g,"_")}_${q}_${per}.csv`); }}>📊 Descargar CSV</Btn>
            <Btn small variant="ghost" onClick={() => { const all = lines.map(l => ({...l, ...calc(l)})); exportPrint(all, cc.name.toUpperCase(), `Planilla — ${q === "1Q" ? "Primera" : "Segunda"} Quincena, ${per}`, totalNeto); }}>🖨️ Imprimir/PDF</Btn>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn variant="success" onClick={() => { sP([...pays, { id: uid(), company: co, periodo: per, quincena: q, date: new Date().toISOString(), total: +totalNeto.toFixed(2), count: lines.length, lines: lines.map(l => ({ ...l, ...calc(l) })) }]); setModal(null); }}>Guardar planilla</Btn>
          </div>
        </div>
      </>}
    </div>;
  };

  // ── Simple forms ──
  const VacForm = ({ vac, onSave }) => { const [f, setF] = useState(vac || { employeeId: "", startDate: "", endDate: "", notes: "", status: "pending" }); const u = (k, v) => setF(p => ({ ...p, [k]: v })); const d = f.startDate && f.endDate ? daysBetween(f.startDate, f.endDate) : 0; return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}><Select label="Empleado" options={ae.map(e => ({ value: e.id, label: e.fullName }))} value={f.employeeId} onChange={e => u("employeeId", e.target.value)} /><Select label="Estado" options={[{ value: "pending", label: "Pendiente" }, { value: "approved", label: "Aprobado" }, { value: "rejected", label: "Rechazado" }]} value={f.status} onChange={e => u("status", e.target.value)} /><Input label="Inicio" type="date" value={f.startDate} onChange={e => u("startDate", e.target.value)} /><Input label="Fin" type="date" value={f.endDate} onChange={e => u("endDate", e.target.value)} />{d > 0 && <div style={{ gridColumn: "1/-1", background: "#EFF6FF", padding: 10, borderRadius: 8, fontSize: 13 }}>Dias: <b>{d}</b></div>}<div style={{ gridColumn: "1/-1" }}><Input label="Notas" value={f.notes} onChange={e => u("notes", e.target.value)} /></div><div style={{ gridColumn: "1/-1", display: "flex", justifyContent: "flex-end", gap: 10 }}><Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn><Btn variant="success" onClick={() => { if (!f.employeeId) return; onSave({ ...f, id: f.id || uid(), days: d }); setModal(null); }}>{vac ? "Actualizar" : "Registrar"}</Btn></div></div>; };
  const LvForm = ({ lv, onSave }) => { const [f, setF] = useState(lv || { employeeId: "", date: "", type: "", reason: "", status: "approved" }); const u = (k, v) => setF(p => ({ ...p, [k]: v })); return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}><Select label="Empleado" options={ae.map(e => ({ value: e.id, label: e.fullName }))} value={f.employeeId} onChange={e => u("employeeId", e.target.value)} /><Select label="Tipo" options={LEAVE_TYPES} value={f.type} onChange={e => u("type", e.target.value)} /><Input label="Fecha" type="date" value={f.date} onChange={e => u("date", e.target.value)} /><Select label="Estado" options={[{ value: "approved", label: "Aprobado" }, { value: "pending", label: "Pendiente" }]} value={f.status} onChange={e => u("status", e.target.value)} /><div style={{ gridColumn: "1/-1" }}><Input label="Motivo" value={f.reason} onChange={e => u("reason", e.target.value)} /></div><div style={{ gridColumn: "1/-1", display: "flex", justifyContent: "flex-end", gap: 10 }}><Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn><Btn variant="success" onClick={() => { if (!f.employeeId) return; onSave({ ...f, id: f.id || uid() }); setModal(null); }}>{lv ? "Actualizar" : "Registrar"}</Btn></div></div>; };

  // ── CUADRILLA DISTRIBUTION ──
  const CuadrillaForm = () => {
    const [per, setPer] = useState("");
    const [q, setQ] = useState("2Q");
    const [assignments, setAssignments] = useState({});
    const [step, setStep] = useState(1);

    const initAssign = () => {
      if (!per) return alert("Seleccione periodo");
      const existing = cq.find(x => x.periodo === per && x.quincena === q);
      if (existing) { setAssignments(existing.assignments); setStep(2); return; }
      const a = {}; ae.forEach(e => { a[e.id] = e.project || ""; });
      setAssignments(a); setStep(2);
    };

    const projEmps = (proj) => ae.filter(e => assignments[e.id] === proj);
    const unassigned = ae.filter(e => !assignments[e.id]);

    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {step === 1 && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 14, alignItems: "end" }}>
        <Input label="Periodo" type="month" value={per} onChange={e => setPer(e.target.value)} />
        <Select label="Quincena" options={[{ value: "1Q", label: "1Q (1-15)" }, { value: "2Q", label: "2Q (16-31)" }]} value={q} onChange={e => setQ(e.target.value)} />
        <Btn onClick={initAssign}>Siguiente</Btn>
      </div>}
      {step === 2 && <>
        <div style={{ background: "#EFF6FF", border: "1px solid #93C5FD", borderRadius: 10, padding: 12, fontSize: 13, color: "#1E40AF" }}>
          Distribucion {q} {per} — Asigne cada empleado a un proyecto. {unassigned.length > 0 && <b style={{ color: "#DC2626" }}>{unassigned.length} sin asignar</b>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {PROJECTS.map(proj => (
            <div key={proj.short} style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: cc.color, display: "flex", justifyContent: "space-between" }}>
                <span>{proj.short}</span><Badge color={cc.color}>{projEmps(proj.short).length}</Badge>
              </div>
              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 8 }}>[{proj.code}] {proj.name}</div>
              {projEmps(proj.short).map(e => (
                <div key={e.id} style={{ fontSize: 12, padding: "4px 0", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #F1F5F9" }}>
                  <span>{e.fullName}</span>
                  <button onClick={() => setAssignments(a => ({ ...a, [e.id]: "" }))} style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: 14 }}>×</button>
                </div>
              ))}
            </div>
          ))}
        </div>
        {unassigned.length > 0 && <div style={{ background: "#FEF3C7", border: "1px solid #F59E0B", borderRadius: 12, padding: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#92400E", marginBottom: 8 }}>Sin asignar ({unassigned.length})</div>
          {unassigned.map(e => (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12 }}>
              <span style={{ flex: 1 }}>{e.fullName} — {e.position}</span>
              <select value="" onChange={ev => { if (ev.target.value) setAssignments(a => ({ ...a, [e.id]: ev.target.value })); }} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid #CBD5E1", fontSize: 12 }}>
                <option value="">Asignar a...</option>
                {PROJECTS.map(p => <option key={p.short} value={p.short}>{p.short} — {p.name}</option>)}
              </select>
            </div>
          ))}
        </div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
          <Btn variant="success" onClick={() => {
            const record = { id: uid(), company: co, periodo: per, quincena: q, assignments, date: new Date().toISOString() };
            const existing = cuadrillas.findIndex(x => x.company === co && x.periodo === per && x.quincena === q);
            if (existing >= 0) { const u = [...cuadrillas]; u[existing] = record; sCq(u); }
            else sCq([...cuadrillas, record]);
            const updated = emps.map(e => assignments[e.id] ? { ...e, project: assignments[e.id] } : e);
            sE(updated);
            setModal(null);
          }}>Guardar distribucion</Btn>
        </div>
      </>}
    </div>;
  };

  // ── ATTENDANCE GRID ──
  const AttendanceGrid = ({ sheet }) => {
    const [data, setData] = useState(sheet?.grid || {});
    const [overrides, setOverrides] = useState(sheet?.projOverrides || {});
    const [editingCell, setEditingCell] = useState(null);

    const getDays = () => {
      const [y, m] = sheet.periodo.split("-").map(Number);
      const start = sheet.quincena === "1Q" ? 1 : 16;
      const lastDay = new Date(y, m, 0).getDate();
      const end = sheet.quincena === "1Q" ? 15 : lastDay;
      const days = [];
      for (let d = start; d <= end; d++) {
        const dt = new Date(y, m - 1, d);
        const isHoliday = esFeriadoQuincena(sheet.periodo, d);
        days.push({
          day: d,
          dow: DAYS_ES[dt.getDay()],
          isSun: dt.getDay() === 0,
          isSat: dt.getDay() === 6,
          isHoliday,
          holidayName: isHoliday ? nombreFeriado(y, m - 1, d) : null,
          dt,
        });
      }
      return days;
    };
    const days = getDays();
    const assignments = sheet.assignments || {};
    const projGroups = PROJECTS.filter(p => ae.some(e => (assignments[e.id] === p.short) || resolveShort(assignments[e.id]) === p.short));

    // Determina si un dia esta bloqueado para un empleado segun su fecha de
    // alta (startDate) o baja (endDate). Devuelve la razon si esta bloqueado.
    const dayLockReason = (e, dayObj) => {
      const dStr = `${sheet.periodo}-${String(dayObj.day).padStart(2, "0")}`;
      if (e.startDate && dStr < e.startDate) return "Antes del alta";
      if (e.endDate && dStr > e.endDate) return "Después de la baja";
      return null;
    };

    const cellKey = (eid, day) => `${eid}-${day}`;
    const getVal = (eid, day) => data[cellKey(eid, day)] || "";
    const getProj = (eid, day) => overrides[cellKey(eid, day)] || null;
    const cycle = (eid, day) => {
      // No permitir editar dias bloqueados por alta/baja
      const emp = ae.find((x) => x.id === eid);
      const dayObj = days.find((d) => d.day === day);
      if (emp && dayObj && dayLockReason(emp, dayObj)) return;
      const k = cellKey(eid, day);
      const cur = data[k] || "";
      const next = cur === "" ? "1" : cur === "1" ? "0" : cur === "0" ? "INC" : "";
      setData(d => ({ ...d, [k]: next }));
    };
    const setOverride = (eid, day, proj) => {
      const k = cellKey(eid, day);
      if (proj === assignments[eid] || !proj) { setOverrides(o => { const n = { ...o }; delete n[k]; return n; }); }
      else { setOverrides(o => ({ ...o, [k]: proj })); }
      setEditingCell(null);
    };

    const cellColor = (v, hasOvr) => {
      if (hasOvr) return v === "1" ? "#DBEAFE" : v === "0" ? "#FEE2E2" : v === "INC" ? "#FEF9C3" : "#EFF6FF";
      return v === "1" ? "#DCFCE7" : v === "0" ? "#FEE2E2" : v === "INC" ? "#FEF9C3" : "transparent";
    };
    const cellText = (v, ovr) => { const t = v === "1" ? "1" : v === "0" ? "0" : v === "INC" ? "I" : ""; return ovr ? `${t}*` : t; };
    const cellFontColor = v => v === "1" ? "#166534" : v === "0" ? "#991B1B" : v === "INC" ? "#92400E" : "#CBD5E1";

    const empStats = (eid) => {
      let present = 0, absent = 0, incap = 0, domTrab = 0, ferTrab = 0;
      days.forEach(d => {
        const v = getVal(eid, d.day);
        if (v === "1") {
          present++;
          if (d.isSun && !d.isHoliday) domTrab++;
          if (d.isHoliday) ferTrab++;
        } else if (v === "0") absent++;
        else if (v === "INC") incap++;
      });
      return { present, absent, incap, domTrab, ferTrab };
    };

    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "#EFF6FF", border: "1px solid #93C5FD", borderRadius: 10, padding: 12, fontSize: 12, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span style={{ color: "#1E40AF", fontWeight: 600, fontSize: 14 }}>Asistencia {sheet.quincena} {sheet.periodo} — {cc.name}</span>
        <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          <span style={{ background: "#DCFCE7", padding: "2px 8px", borderRadius: 4 }}>1 = Presente</span>
          <span style={{ background: "#FEE2E2", padding: "2px 8px", borderRadius: 4 }}>0 = NSP</span>
          <span style={{ background: "#FEF9C3", padding: "2px 8px", borderRadius: 4 }}>I = Incapacidad</span>
          <span style={{ background: "#DBEAFE", padding: "2px 8px", borderRadius: 4 }}>1* = Otro proyecto</span>
          <span style={{ background: "#F3E8FF", padding: "2px 8px", borderRadius: 4, color: "#7C3AED" }}>D = Domingo (+día)</span>
          <span style={{ background: "#FED7AA", padding: "2px 8px", borderRadius: 4, color: "#9A3412" }}>F = Feriado (+2 días)</span>
          <span style={{ background: "#E5E7EB", padding: "2px 8px", borderRadius: 4, color: "#6B7280" }}>—  = Bloqueado (alta/baja)</span>
        </span>
      </div>

      {/* Resumen por proyecto — sin valores monetarios */}
      <div style={{ background: "#FFFBF5", border: "1px solid #DBD4C8", borderRadius: 10, padding: "14px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#8B847C", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>Resumen de la quincena</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          {projGroups.map((proj) => {
            const pEmps = ae.filter((e) => resolveShort(assignments[e.id]) === proj.short);
            // Calcular dias trabajados totales en el proyecto (considerando overrides)
            let totalDias = 0;
            ae.forEach((e) => {
              days.forEach((d) => {
                const v = getVal(e.id, d.day);
                if (v === "1") {
                  const ovr = getProj(e.id, d.day);
                  const projForDay = ovr || resolveShort(assignments[e.id]);
                  if (projForDay === proj.short) totalDias++;
                }
              });
            });
            return (
              <div key={proj.short} style={{ background: "#F8F2E6", padding: "10px 14px", borderRadius: 8, borderLeft: "3px solid #E8762D" }}>
                <div style={{ fontWeight: 700, color: "#2C2A28", fontSize: 13 }}>{proj.short}</div>
                <div style={{ fontSize: 11, color: "#5C5853", marginTop: 2 }}>{proj.name}</div>
                <div style={{ marginTop: 8, display: "flex", gap: 16, fontSize: 12 }}>
                  <span><strong style={{ color: "#E8762D" }}>{pEmps.length}</strong> personas</span>
                  <span><strong style={{ color: "#2C5F5D" }}>{totalDias}</strong> días trabajados</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {projGroups.map(proj => {
        const pEmps = ae.filter(e => assignments[e.id] === proj.short);
        if (pEmps.length === 0) return null;
        return <div key={proj.short} style={{ borderRadius: 12, border: "1px solid #E2E8F0", overflow: "hidden" }}>
          <div style={{ background: cc.color, color: "#fff", padding: "8px 14px", fontWeight: 700, fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{proj.short} ({pEmps.length})</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontWeight: 400, fontSize: 10, opacity: 0.7 }}>[{proj.code}]</span>
              <button onClick={() => {
                const newData = { ...data };
                pEmps.forEach(e => { days.forEach(d => { const k = cellKey(e.id, d.day); if (!newData[k]) newData[k] = "1"; }); });
                setData(newData);
              }} style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 6, color: "#fff", padding: "3px 10px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>✓ Asistencia completa</button>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr style={{ background: "#F1F5F9" }}>
                <th style={{ ...TH, position: "sticky", left: 0, background: "#F1F5F9", zIndex: 2, minWidth: 170 }}>Nombre</th>
                {days.map(d => {
                  const bg = d.isHoliday ? "#FED7AA" : d.isSun ? "#F3E8FF" : d.isSat ? "#FEF3C7" : "#F1F5F9";
                  const labelColor = d.isHoliday ? "#9A3412" : "#94A3B8";
                  return (
                    <th
                      key={d.day}
                      title={d.isHoliday ? `Feriado: ${d.holidayName}` : ""}
                      style={{ ...TH, textAlign: "center", minWidth: 32, background: bg }}
                    >
                      <div style={{ fontSize: 10, color: labelColor, fontWeight: d.isHoliday ? 700 : 600 }}>
                        {d.isHoliday ? "F" : d.dow}
                      </div>
                      {d.day}
                    </th>
                  );
                })}
                <th style={{ ...TH, textAlign: "center", background: "#ECFDF5" }}>Dias</th>
                <th style={{ ...TH, textAlign: "center", background: "#F3E8FF", color: "#7C3AED" }}>DOM</th>
                <th style={{ ...TH, textAlign: "center", background: "#FED7AA", color: "#9A3412" }}>FER</th>
                <th style={{ ...TH, textAlign: "center", background: "#FEE2E2" }}>NSP</th>
                <th style={{ ...TH, textAlign: "center", background: "#FEF9C3" }}>INC</th>
              </tr></thead>
              <tbody>{pEmps.map(e => {
                const st = empStats(e.id);
                return <tr key={e.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td style={{ ...TD, position: "sticky", left: 0, background: "#fff", zIndex: 1, fontWeight: 600, fontSize: 11 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span>{e.fullName}</span>
                      <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 9, fontWeight: 700, color: "#E8762D", letterSpacing: 0.5 }}>{genEmpCode(e.fullName, e.dni)}</span>
                    </div>
                  </td>
                  {days.map(d => {
                    const k = cellKey(e.id, d.day);
                    const val = getVal(e.id, d.day);
                    const ovr = getProj(e.id, d.day);
                    const isEditing = editingCell === k;
                    const lockReason = dayLockReason(e, d);
                    if (lockReason) {
                      return (
                        <td
                          key={d.day}
                          title={lockReason}
                          style={{ ...TD, textAlign: "center", background: "#E5E7EB", color: "#9CA3AF", fontWeight: 700, userSelect: "none", minWidth: 32, border: "1px solid #F1F5F9", fontSize: 11, cursor: "not-allowed" }}
                        >
                          —
                        </td>
                      );
                    }
                    return <td key={d.day} style={{ ...TD, textAlign: "center", cursor: "pointer", background: d.isHoliday && val === "1" ? "#FED7AA" : cellColor(val, ovr), color: d.isHoliday && val === "1" ? "#9A3412" : cellFontColor(val), fontWeight: 700, userSelect: "none", minWidth: 32, border: "1px solid #F1F5F9", position: "relative", fontSize: 11 }}
                      onClick={() => cycle(e.id, d.day)}
                      onContextMenu={(ev) => { ev.preventDefault(); setEditingCell(isEditing ? null : k); }}
                      title={d.isHoliday ? `${d.holidayName}${val === "1" ? " · trabajado +2 días" : ""}` : ovr ? `Reasignado a ${ovr}. Click derecho para cambiar.` : "Click derecho para reasignar proyecto"}>
                      {cellText(val, ovr) || <span style={{ color: "#E2E8F0" }}>·</span>}
                      {ovr && <div style={{ fontSize: 7, color: "#2563EB", lineHeight: 1 }}>{ovr}</div>}
                      {isEditing && <div style={{ position: "absolute", top: "100%", left: 0, background: "#fff", border: "1px solid #CBD5E1", borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,.15)", zIndex: 10, minWidth: 140 }} onClick={ev => ev.stopPropagation()}>
                        <div style={{ padding: "4px 8px", fontSize: 10, color: "#64748b", borderBottom: "1px solid #F1F5F9" }}>Proyecto para este dia:</div>
                        <div style={{ padding: "4px 8px", fontSize: 11, cursor: "pointer", background: !ovr ? "#EFF6FF" : "transparent" }} onClick={() => setOverride(e.id, d.day, null)}>✓ {assignments[e.id]} (base)</div>
                        {PROJECTS.filter(p => p.short !== assignments[e.id]).map(p => (
                          <div key={p.short} style={{ padding: "4px 8px", fontSize: 11, cursor: "pointer", background: ovr === p.short ? "#DBEAFE" : "transparent" }} onClick={() => setOverride(e.id, d.day, p.short)}>{ovr === p.short ? "✓ " : ""}{p.short}</div>
                        ))}
                      </div>}
                    </td>;
                  })}
                  <td style={{ ...TD, textAlign: "center", fontWeight: 700, background: "#ECFDF5", color: "#059669" }}>{st.present}</td>
                  <td style={{ ...TD, textAlign: "center", fontWeight: 700, background: st.domTrab > 0 ? "#F3E8FF" : "transparent", color: "#7C3AED" }}>{st.domTrab || ""}</td>
                  <td style={{ ...TD, textAlign: "center", fontWeight: 700, background: st.ferTrab > 0 ? "#FED7AA" : "transparent", color: "#9A3412" }}>{st.ferTrab || ""}</td>
                  <td style={{ ...TD, textAlign: "center", fontWeight: 700, background: st.absent > 0 ? "#FEE2E2" : "transparent", color: "#DC2626" }}>{st.absent || ""}</td>
                  <td style={{ ...TD, textAlign: "center", fontWeight: 700, background: st.incap > 0 ? "#FEF9C3" : "transparent", color: "#92400E" }}>{st.incap || ""}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        </div>;
      })}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Btn variant="ghost" onClick={() => setModal(null)}>Cerrar</Btn>
        <Btn variant="info" onClick={() => exportAttendancePDF()}>📄 Exportar PDF</Btn>
        <Btn variant="success" onClick={() => {
          const record = { ...sheet, grid: data, projOverrides: overrides, lastSaved: new Date().toISOString() };
          const existing = atts.findIndex(a => a.id === sheet.id);
          if (existing >= 0) { const u = [...atts]; u[existing] = record; sA(u); }
          else sA([...atts, record]);
          setModal(null);
        }}>Guardar asistencia</Btn>
      </div>
    </div>;

    function exportAttendancePDF() {
      const w = window.open("", "_blank");
      if (!w) { alert("Permite popups para imprimir"); return; }

      // Construir resumen por proyecto
      const summary = projGroups.map((proj) => {
        const pEmps = ae.filter((e) => resolveShort(assignments[e.id]) === proj.short);
        let totalDias = 0;
        let totalDom = 0, totalFer = 0, totalNSP = 0, totalINC = 0;
        ae.forEach((e) => {
          days.forEach((d) => {
            const v = getVal(e.id, d.day);
            if (v === "1") {
              const ovr = getProj(e.id, d.day);
              const projForDay = ovr || resolveShort(assignments[e.id]);
              if (projForDay === proj.short) {
                totalDias++;
                if (resolveShort(assignments[e.id]) === proj.short) {
                  if (d.isSun && !d.isHoliday) totalDom++;
                  if (d.isHoliday) totalFer++;
                }
              }
            } else if (v === "0" && resolveShort(assignments[e.id]) === proj.short) totalNSP++;
            else if (v === "INC" && resolveShort(assignments[e.id]) === proj.short) totalINC++;
          });
        });
        return { proj, pEmps, totalDias, totalDom, totalFer, totalNSP, totalINC };
      });

      const dayHeaderHtml = days
        .map((d) => {
          const bg = d.isHoliday ? "#FED7AA" : d.isSun ? "#F3E8FF" : d.isSat ? "#FEF3C7" : "#F1F5F9";
          const labelColor = d.isHoliday ? "#9A3412" : "#64748b";
          return `<th style="background:${bg};text-align:center;font-size:8px;padding:3px 2px;border:1px solid #E2E8F0">
            <div style="color:${labelColor};font-weight:${d.isHoliday ? 700 : 600};font-size:7px">${d.isHoliday ? "F" : d.dow}</div>
            <div>${d.day}</div>
          </th>`;
        })
        .join("");

      const projTablesHtml = projGroups
        .map((proj) => {
          const pEmps = ae.filter((e) => resolveShort(assignments[e.id]) === proj.short);
          if (pEmps.length === 0) return "";
          const rows = pEmps
            .map((e) => {
              const st = empStats(e.id);
              const code = genEmpCode(e.fullName, e.dni);
              const cells = days
                .map((d) => {
                  const lockReason = dayLockReason(e, d);
                  if (lockReason) {
                    return `<td style="background:#E5E7EB;color:#9CA3AF;text-align:center;font-size:9px;padding:3px 2px;border:1px solid #E2E8F0;font-weight:700">—</td>`;
                  }
                  const v = getVal(e.id, d.day);
                  const ovr = getProj(e.id, d.day);
                  let bg = "transparent";
                  let color = "#CBD5E1";
                  if (d.isHoliday && v === "1") { bg = "#FED7AA"; color = "#9A3412"; }
                  else if (ovr) { bg = v === "1" ? "#DBEAFE" : v === "0" ? "#FEE2E2" : v === "INC" ? "#FEF9C3" : "#EFF6FF"; color = v === "1" ? "#1E40AF" : v === "0" ? "#991B1B" : "#92400E"; }
                  else if (v === "1") { bg = "#DCFCE7"; color = "#166534"; }
                  else if (v === "0") { bg = "#FEE2E2"; color = "#991B1B"; }
                  else if (v === "INC") { bg = "#FEF9C3"; color = "#92400E"; }
                  const txt = v === "1" ? (ovr ? "1*" : "1") : v === "0" ? "0" : v === "INC" ? "I" : "·";
                  return `<td style="background:${bg};color:${color};text-align:center;font-size:9px;padding:3px 2px;border:1px solid #E2E8F0;font-weight:700">${txt}</td>`;
                })
                .join("");
              return `<tr>
                <td style="padding:5px 8px;border:1px solid #E2E8F0;font-size:10px;font-weight:600">
                  ${e.fullName}<br><span style="font-family:monospace;color:#E8762D;font-size:8px">${code}</span>
                </td>
                ${cells}
                <td style="text-align:center;background:#ECFDF5;color:#059669;font-weight:700;padding:3px 6px;border:1px solid #E2E8F0">${st.present}</td>
                <td style="text-align:center;background:${st.domTrab > 0 ? "#F3E8FF" : "#fff"};color:#7C3AED;font-weight:700;padding:3px 6px;border:1px solid #E2E8F0">${st.domTrab || ""}</td>
                <td style="text-align:center;background:${st.ferTrab > 0 ? "#FED7AA" : "#fff"};color:#9A3412;font-weight:700;padding:3px 6px;border:1px solid #E2E8F0">${st.ferTrab || ""}</td>
                <td style="text-align:center;background:${st.absent > 0 ? "#FEE2E2" : "#fff"};color:#DC2626;font-weight:700;padding:3px 6px;border:1px solid #E2E8F0">${st.absent || ""}</td>
                <td style="text-align:center;background:${st.incap > 0 ? "#FEF9C3" : "#fff"};color:#92400E;font-weight:700;padding:3px 6px;border:1px solid #E2E8F0">${st.incap || ""}</td>
              </tr>`;
            })
            .join("");
          return `
            <div style="margin-top:18px;page-break-inside:avoid">
              <h3 style="background:${cc.color};color:#fff;padding:6px 10px;font-size:12px;margin:0">${proj.short} — ${proj.name} <span style="font-weight:400;font-size:10px;opacity:.7">[${proj.code}] · ${pEmps.length} personas</span></h3>
              <table style="border-collapse:collapse;width:100%;margin-top:0">
                <thead><tr>
                  <th style="background:#F1F5F9;text-align:left;font-size:9px;padding:4px 8px;border:1px solid #E2E8F0">Empleado</th>
                  ${dayHeaderHtml}
                  <th style="background:#ECFDF5;font-size:9px;padding:4px 6px;border:1px solid #E2E8F0">Días</th>
                  <th style="background:#F3E8FF;color:#7C3AED;font-size:9px;padding:4px 6px;border:1px solid #E2E8F0">DOM</th>
                  <th style="background:#FED7AA;color:#9A3412;font-size:9px;padding:4px 6px;border:1px solid #E2E8F0">FER</th>
                  <th style="background:#FEE2E2;font-size:9px;padding:4px 6px;border:1px solid #E2E8F0">NSP</th>
                  <th style="background:#FEF9C3;font-size:9px;padding:4px 6px;border:1px solid #E2E8F0">INC</th>
                </tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>`;
        })
        .join("");

      const summaryHtml = summary
        .map((s) => `
          <div style="background:#F8F2E6;border-left:3px solid #E8762D;padding:10px 14px;border-radius:8px">
            <div style="font-weight:700;color:#2C2A28;font-size:13px">${s.proj.short}</div>
            <div style="font-size:11px;color:#5C5853;margin-top:2px">${s.proj.name}</div>
            <div style="margin-top:8px;font-size:11px;display:flex;gap:14px;flex-wrap:wrap">
              <span><strong style="color:#E8762D">${s.pEmps.length}</strong> personas</span>
              <span><strong style="color:#2C5F5D">${s.totalDias}</strong> días</span>
              ${s.totalDom > 0 ? `<span><strong style="color:#7C3AED">${s.totalDom}</strong> dom.</span>` : ""}
              ${s.totalFer > 0 ? `<span><strong style="color:#9A3412">${s.totalFer}</strong> fer.</span>` : ""}
              ${s.totalNSP > 0 ? `<span><strong style="color:#DC2626">${s.totalNSP}</strong> NSP</span>` : ""}
            </div>
          </div>
        `)
        .join("");

      w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Asistencia ${sheet.quincena} ${sheet.periodo}</title>
        <style>
          *{margin:0;padding:0;box-sizing:border-box}
          body{font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;padding:24px;color:#2C2A28}
          h1{font-size:22px;margin-bottom:4px;color:#2C2A28;letter-spacing:-0.3px}
          h2{font-size:13px;color:#5C5853;font-weight:500;margin-bottom:14px}
          @media print {.np{display:none}}
        </style>
      </head><body>
        <div style="border-left:4px solid #E8762D;padding-left:14px;margin-bottom:18px">
          <div style="font-size:9px;color:#E8762D;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">Geotecnica Soluciones · RRHH</div>
          <h1>Asistencia ${sheet.quincena} ${sheet.periodo}</h1>
          <h2>${cc.name} · Generado ${new Date().toLocaleDateString("es-HN", { day: "numeric", month: "long", year: "numeric" })}</h2>
        </div>
        <div style="font-size:11px;font-weight:700;color:#8B847C;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:8px">Resumen por proyecto</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:18px">
          ${summaryHtml}
        </div>
        ${projTablesHtml}
        <div style="margin-top:24px;padding-top:14px;border-top:1px solid #DBD4C8;font-size:10px;color:#8B847C;display:flex;gap:12px;flex-wrap:wrap">
          <span><strong>1</strong> = Presente</span>
          <span><strong>0</strong> = NSP (No se presentó)</span>
          <span><strong>I</strong> = Incapacidad</span>
          <span><strong>1*</strong> = Otro proyecto</span>
          <span><strong>F</strong> = Feriado (+2 días si trabajado)</span>
          <span><strong>—</strong> = Bloqueado por alta/baja</span>
        </div>
        <br><button class="np" onclick="window.print()" style="padding:10px 24px;font-size:14px;cursor:pointer;background:#E8762D;color:white;border:none;border-radius:8px;font-weight:600">Imprimir / Guardar como PDF</button>
      </body></html>`);
      w.document.close();
    };
  };

  const ConForm = () => { const [eid, setEid] = useState(""); const [tp, setTp] = useState("laboral"); const emp = emps.find(e => e.id === eid); const today = new Date().toLocaleDateString("es-HN", { day: "numeric", month: "long", year: "numeric" }); const txt = emp ? (tp === "laboral" ? `CONSTANCIA LABORAL\n\nHacemos constar que ${emp.fullName}, identidad ${emp.dni}, labora para ${COMPANIES[emp.company].name}, cargo: ${emp.position}, desde ${fmt(emp.startDate)} a la fecha.\n\nSan Pedro Sula, ${today}.\n\nGerson Steve Trochez Cubas\nRecursos Humanos` : `CONSTANCIA DE INGRESOS\n\nHacemos constar que ${emp.fullName}, identidad ${emp.dni}, labora para ${COMPANIES[emp.company].name}, cargo: ${emp.position}, salario mensual: ${fmtL(emp.salary)}.\n\nSan Pedro Sula, ${today}.\n\nGerson Steve Trochez Cubas\nRecursos Humanos`) : ""; return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}><Select label="Empleado" options={ae.map(e => ({ value: e.id, label: e.fullName }))} value={eid} onChange={e => setEid(e.target.value)} /><Select label="Tipo" options={[{ value: "laboral", label: "Laboral" }, { value: "ingresos", label: "Ingresos" }]} value={tp} onChange={e => setTp(e.target.value)} /></div>{txt && <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: 18 }}><pre style={{ whiteSpace: "pre-wrap", fontFamily: "'Segoe UI'", fontSize: 13, lineHeight: 1.7, margin: 0 }}>{txt}</pre></div>}<div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}><Btn variant="ghost" onClick={() => setModal(null)}>Cerrar</Btn>{txt && <Btn variant="success" onClick={() => { sC([...cons, { id: uid(), employeeId: eid, type: tp, date: new Date().toISOString(), text: txt }]); navigator.clipboard?.writeText(txt); alert("Copiado"); setModal(null); }}>Copiar y guardar</Btn>}</div></div>; };

  // ── SECTIONS ──
  const renderDashboard = () => {
    const tmp = ae.filter(e => e.contractType === "temporary"); const pm = ae.filter(e => e.contractType === "permanent"); const hon = ae.filter(e => e.contractType === "honorarios");
    const tp = ae.reduce((s, e) => s + (Number(e.salary) || 0), 0);
    const soon = tmp.filter(e => { if (!e.endDate) return false; const d = (new Date(e.endDate) - new Date()) / 86400000; return d >= 0 && d <= 30; });
    return <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <StatCard icon="👥" label="Activos" value={ae.length} color={cc.color} />
        <StatCard icon="📝" label="Permanentes" value={pm.length} color="#2563EB" />
        {tmp.length > 0 && <StatCard icon="⏳" label="Temporales" value={tmp.length} color="#D97706" />}
        {hon.length > 0 && <StatCard icon="📑" label="Honorarios" value={hon.length} color="#7C3AED" />}
        <StatCard icon="💰" label="Planilla mensual" value={fmtL(tp)} color="#059669" />
      </div>
      {soon.length > 0 && <div style={{ background: "#FEF3C7", border: "1px solid #F59E0B", borderRadius: 12, padding: 18 }}><div style={{ fontWeight: 700, color: "#92400E", marginBottom: 8 }}>⚠️ Contratos por vencer (30 dias)</div>{soon.map(e => <div key={e.id} style={{ fontSize: 13, color: "#78350F" }}><b>{e.fullName}</b> — Vence: {fmt(e.endDate)}</div>)}</div>}
      {cp.length > 0 && <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E2E8F0", padding: 18 }}><h4 style={{ margin: "0 0 12px" }}>Ultimas planillas</h4><Table columns={[{ key: "p", label: "Periodo", render: r => `${r.quincena} ${r.periodo}` }, { key: "count", label: "Empleados" }, { key: "total", label: "Total", render: r => <b style={{ color: "#059669" }}>{fmtL(r.total)}</b> }, { key: "date", label: "Fecha", render: r => fmt(r.date) }]} data={cp.slice(-3).reverse()} /></div>}
    </div>;
  };

  const renderEmps = () => <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#64748b", fontSize: 13 }}>{ce.length} empleados</span><Btn onClick={() => setModal({ t: "en" })}>+ Nuevo</Btn></div>
    <Table columns={[
      { key: "code", label: "Código", render: r => <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, fontWeight: 700, color: "#E8762D", letterSpacing: 0.5 }}>{genEmpCode(r.fullName, r.dni)}</span> },
      { key: "fullName", label: "Nombre" },
      { key: "dni", label: "DNI" },
      { key: "position", label: "Cargo" },
      { key: "contractType", label: "Contrato", render: r => <Badge color={r.contractType === "temporary" ? "#D97706" : r.contractType === "honorarios" ? "#7C3AED" : "#2563EB"}>{r.contractType === "temporary" ? "Temporal" : r.contractType === "honorarios" ? "Honorarios" : "Permanente"}</Badge> },
      { key: "salary", label: "Sal.Bruto", render: r => fmtL(r.salary) },
      { key: "bonificacion", label: "Bonif.", render: r => fmtL(r.bonificacion) },
      { key: "startDate", label: "Inicio", render: r => fmt(r.startDate) },
      { key: "status", label: "Estado", render: r => <Badge color={r.status === "active" ? "#059669" : "#DC2626"}>{r.status === "active" ? "Activo" : "Inactivo"}</Badge> },
    ]} data={ce} actions={r => <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}><Btn small variant="ghost" onClick={() => setModal({ t: "ee", d: r })}>Editar</Btn><Btn small variant="danger" onClick={() => { if (confirm(`Eliminar a ${r.fullName}?`)) sE(emps.filter(e => e.id !== r.id)); }}>×</Btn></div>} />
  </div>;

  const renderPayroll = () => <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#64748b", fontSize: 13 }}>{cp.length} planillas</span><Btn onClick={() => setModal({ t: "pn" })}>+ Nueva planilla</Btn></div>
    <Table columns={[{ key: "p", label: "Periodo", render: r => <b>{r.quincena} {r.periodo}</b> }, { key: "count", label: "Empleados" }, { key: "total", label: "Total neto", render: r => <b style={{ color: "#059669" }}>{fmtL(r.total)}</b> }, { key: "date", label: "Fecha", render: r => fmt(r.date) }]} data={cp.slice().reverse()} actions={r => <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}><Btn small variant="ghost" onClick={() => setModal({ t: "pd", d: r })}>Detalle</Btn><Btn small variant="danger" onClick={() => sP(pays.filter(p => p.id !== r.id))}>×</Btn></div>} />
  </div>;

  const renderVacs = () => <div style={{ display: "flex", flexDirection: "column", gap: 16 }}><div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#64748b", fontSize: 13 }}>{cv.length} solicitudes</span><Btn onClick={() => setModal({ t: "vn" })}>+ Nueva</Btn></div><Table columns={[{ key: "e", label: "Empleado", render: r => en(r.employeeId) }, { key: "s", label: "Desde", render: r => fmt(r.startDate) }, { key: "f", label: "Hasta", render: r => fmt(r.endDate) }, { key: "days", label: "Dias" }, { key: "st", label: "Estado", render: r => <Badge color={r.status === "approved" ? "#059669" : r.status === "rejected" ? "#DC2626" : "#D97706"}>{r.status === "approved" ? "Aprobado" : r.status === "rejected" ? "Rechazado" : "Pendiente"}</Badge> }]} data={cv} actions={r => <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}><Btn small variant="ghost" onClick={() => setModal({ t: "ve", d: r })}>Editar</Btn><Btn small variant="danger" onClick={() => sV(vacs.filter(v => v.id !== r.id))}>×</Btn></div>} /></div>;

  const renderLvs = () => <div style={{ display: "flex", flexDirection: "column", gap: 16 }}><div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#64748b", fontSize: 13 }}>{cl.length} permisos</span><Btn onClick={() => setModal({ t: "ln" })}>+ Nuevo</Btn></div><Table columns={[{ key: "e", label: "Empleado", render: r => en(r.employeeId) }, { key: "d", label: "Fecha", render: r => fmt(r.date) }, { key: "t", label: "Tipo", render: r => <Badge>{r.type}</Badge> }, { key: "r", label: "Motivo", render: r => r.reason }, { key: "s", label: "Estado", render: r => <Badge color={r.status === "approved" ? "#059669" : "#D97706"}>{r.status === "approved" ? "Aprobado" : "Pendiente"}</Badge> }]} data={cl} actions={r => <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}><Btn small variant="ghost" onClick={() => setModal({ t: "le", d: r })}>Editar</Btn><Btn small variant="danger" onClick={() => sL(lvs.filter(l => l.id !== r.id))}>×</Btn></div>} /></div>;

  const renderAtts = () => {
    const openGrid = (cuad) => {
      const existing = ca.find(a => a.periodo === cuad.periodo && a.quincena === cuad.quincena);
      if (existing) { setModal({ t: "ag", d: existing }); }
      else { setModal({ t: "ag", d: { id: uid(), company: co, periodo: cuad.periodo, quincena: cuad.quincena, assignments: cuad.assignments, grid: {}, date: new Date().toISOString() } }); }
    };
    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <span style={{ color: "#64748b", fontSize: 13 }}>{cq.length} distribuciones | {ca.length} asistencias</span>
        <Btn onClick={() => setModal({ t: "cuad" })}>+ Distribucion de cuadrilla</Btn>
      </div>
      {cq.length === 0 && <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12, padding: 20, textAlign: "center", color: "#92400E" }}>Paso 1: Cree una distribucion de cuadrilla para iniciar el tracking de asistencia.</div>}
      <Table columns={[
        { key: "p", label: "Periodo", render: r => <b>{r.quincena} {r.periodo}</b> },
        { key: "c", label: "Empleados asignados", render: r => { const a = r.assignments || {}; return Object.values(a).filter(v => v).length; } },
        { key: "pr", label: "Proyectos", render: r => { const a = r.assignments || {}; const ps = [...new Set(Object.values(a).filter(v => v))]; return <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{ps.map(p => <Badge key={p} color={cc.color}>{p}</Badge>)}</span>; } },
        { key: "att", label: "Asistencia", render: r => { const has = ca.find(a => a.periodo === r.periodo && a.quincena === r.quincena); return has ? <Badge color="#059669">Registrada</Badge> : <Badge color="#D97706">Pendiente</Badge>; } },
        { key: "d", label: "Fecha", render: r => fmt(r.date) },
      ]} data={cq.slice().reverse()} actions={r => <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <Btn small variant="primary" onClick={() => openGrid(r)}>Asistencia</Btn>
        <Btn small variant="ghost" onClick={() => setModal({ t: "cuad-edit", d: r })}>Editar cuadrilla</Btn>
        <Btn small variant="danger" onClick={() => sCq(cuadrillas.filter(x => x.id !== r.id))}>×</Btn>
      </div>} />
    </div>;
  };

  const renderCons = () => <div style={{ display: "flex", flexDirection: "column", gap: 16 }}><div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#64748b", fontSize: 13 }}>{cc2.length} emitidas</span><Btn onClick={() => setModal({ t: "cn" })}>+ Generar</Btn></div><Table columns={[{ key: "e", label: "Empleado", render: r => en(r.employeeId) }, { key: "t", label: "Tipo", render: r => <Badge color="#0891B2">{r.type === "laboral" ? "Laboral" : "Ingresos"}</Badge> }, { key: "d", label: "Fecha", render: r => fmt(r.date) }]} data={cc2} actions={r => <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}><Btn small variant="ghost" onClick={() => { navigator.clipboard?.writeText(r.text); alert("Copiado"); }}>Copiar</Btn><Btn small variant="danger" onClick={() => sC(cons.filter(c => c.id !== r.id))}>×</Btn></div>} /></div>;

  const PayDetail = ({ p }) => {
    const [lines, setLn] = useState((p.lines || []).map(l => ({ ...l, bq: l.bq || 0, o1: l.o1 || 0, o2: l.o2 || 0, isr: l.isr || 0, amdc: l.amdc || 0, ihss: l.ihss || 0, rap: l.rap || 0, coop: l.coop || 0, aus: l.aus || 0, otros: l.otros || 0, nota: l.nota || "", diasPresente: l.diasPresente || 0, diasNSP: l.diasNSP || 0, descuentoNSP: l.descuentoNSP || 0, domTrab: l.domTrab || 0, bonoDomingo: l.bonoDomingo || 0, proj: l.proj || "", so: l.so || 0, sb: l.sb || 0, sd: l.sd || 0 })));
    const ul2 = (id, k, v) => setLn(ls => ls.map(l => l.id === id ? { ...l, [k]: v } : l));
    const calc2 = l => {
      const bd = +(l.bonoDomingo || 0);
      const tOtros = +(+l.bq + +l.o1 + (+l.o2 || 0) + bd).toFixed(2);
      const tDed = +(+l.isr + (+l.amdc || 0) + +l.ihss + +l.rap + +l.coop + (+l.aus || 0) + +l.otros).toFixed(2);
      return { tOtros, tDed, neto: +(l.so + tOtros - tDed).toFixed(2), bonoDomingo: bd };
    };
    const totalNeto = lines.reduce((s, l) => s + calc2(l).neto, 0);
    const is2Q = p.quincena === "2Q";

    const permL = lines.filter(l => l.ct === "permanent");
    const tempL = lines.filter(l => l.ct === "temporary");
    const honL = lines.filter(l => l.ct === "honorarios");

    const projCosts = {};
    lines.forEach(l => { const pr = l.proj || "SIN ASIGNAR"; if (!projCosts[pr]) projCosts[pr] = { count: 0, neto: 0 }; projCosts[pr].count++; projCosts[pr].neto += calc2(l).neto; });

    const doExcel = () => { const all = lines.map(l => ({...l, ...calc2(l)})); exportCSV(all, `Planilla_${cc.name.replace(/ /g,"_")}_${p.quincena}_${p.periodo}.csv`); };
    const doPDF = () => { const all = lines.map(l => ({...l, ...calc2(l)})); exportPrint(all, cc.name.toUpperCase(), `Planilla — ${p.quincena === "1Q" ? "Primera" : "Segunda"} Quincena, ${p.periodo}`, totalNeto); };

    const renderBlock = (rows, label, color) => {
      if (rows.length === 0) return null;
      const sub = rows.reduce((s, l) => s + calc2(l).neto, 0);
      const sums = { sb: 0, so: 0, bq: 0, oi: 0, dias: 0, nsp: 0, dNSP: 0, dom: 0, bdom: 0, isr: 0, ihss: 0, rap: 0, coop: 0, otros: 0, tDed: 0, neto: 0 };
      rows.forEach(l => { const c = calc2(l); sums.sb += l.sb; sums.so += l.so; sums.dom += (l.domTrab || 0); sums.bdom += (l.bonoDomingo || 0); sums.bq += l.bq; sums.oi += l.o1; sums.dias += l.diasPresente || 0; sums.nsp += l.diasNSP || 0; sums.dNSP += l.descuentoNSP || 0; sums.isr += l.isr; sums.ihss += l.ihss; sums.rap += l.rap; sums.coop += l.coop; sums.otros += l.otros; sums.tDed += c.tDed; sums.neto += c.neto; });
      return <div style={{ borderRadius: 12, border: "1px solid #E2E8F0", overflow: "hidden" }}>
        <div style={{ background: color, color: "#fff", padding: "8px 14px", fontWeight: 700, fontSize: 13, display: "flex", justifyContent: "space-between" }}>
          <span>{label} ({rows.length})</span><span>Subtotal: {fmtL(sub)}</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead><tr style={{ background: "#F1F5F9" }}>
              <th style={TH}>#</th><th style={{ ...TH, minWidth: 150 }}>Nombre</th><th style={TH}>Proy.</th>
              <th style={TH}>Sal.Bruto</th><th style={TH}>Dias</th><th style={{ ...TH, color: "#DC2626" }}>NSP</th><th style={TH}>Desc.NSP</th>
              <th style={TH}>Sal.Ord.</th><th style={{ ...TH, color: "#7C3AED", background: "#F3E8FF" }}>DOM</th><th style={{ ...TH, color: "#7C3AED", background: "#F3E8FF" }}>Bono Dom.</th>
              <th style={TH}>Bonif.Q</th><th style={TH}>Otros Ing.</th>
              {is2Q && <><th style={TH}>ISR</th><th style={TH}>IHSS</th><th style={TH}>RAP</th><th style={TH}>Coop.</th></>}
              <th style={TH}>Otros Ded.</th><th style={TH}>Tot.Ded</th><th style={{ ...TH, background: "#ECFDF5" }}>Neto</th><th style={TH}>Notas</th>
            </tr></thead>
            <tbody>{rows.map((l, i) => { const c = calc2(l); return <tr key={l.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
              <td style={TD}>{i + 1}</td>
              <td style={{ ...TD, fontWeight: 600 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span>{l.name}</span>
                  {(() => { const emp = ae.find(x => x.id === l.eid) || ce.find(x => x.id === l.eid); return emp ? <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 9, fontWeight: 700, color: "#E8762D", letterSpacing: 0.5 }}>{genEmpCode(emp.fullName, emp.dni)}</span> : null; })()}
                </div>
              </td>
              <td style={TD}><Badge color={cc.color}>{l.proj || "—"}</Badge></td>
              <td style={TD}>{fmtL(l.sb)}</td>
              <td style={{ ...TD, color: "#059669", fontWeight: 600 }}>{l.diasPresente || 0}</td>
              <td style={{ ...TD, color: (l.diasNSP || 0) > 0 ? "#DC2626" : "#94A3B8" }}>{l.diasNSP || 0}</td>
              <td style={{ ...TD, color: "#DC2626" }}>{(l.descuentoNSP || 0) > 0 ? fmtL(l.descuentoNSP) : ""}</td>
              <td style={TD}>{fmtL(l.so)}</td>
              <td style={{ ...TD, color: "#7C3AED", fontWeight: 700, background: (l.domTrab || 0) > 0 ? "#F3E8FF" : "transparent" }}>{l.domTrab || ""}</td>
              <td style={{ ...TD, color: "#7C3AED", fontWeight: 600 }}>{(l.bonoDomingo || 0) > 0 ? fmtL(l.bonoDomingo) : ""}</td>
              <td style={TD}><input type="number" value={l.bq} onChange={e => ul2(l.id, "bq", +e.target.value)} style={INP} /></td>
              <td style={TD}><input type="number" value={l.o1} onChange={e => ul2(l.id, "o1", +e.target.value)} style={INP} /></td>
              {is2Q && <>
                <td style={TD}><input type="number" value={l.isr} onChange={e => ul2(l.id, "isr", +e.target.value)} style={INP} /></td>
                <td style={TD}>{fmtL(l.ihss)}</td>
                <td style={TD}>{l.rap > 0 ? fmtL(l.rap) : ""}</td>
                <td style={TD}><input type="number" value={l.coop} onChange={e => ul2(l.id, "coop", +e.target.value)} style={INP} /></td>
              </>}
              <td style={TD}><input type="number" value={l.otros} onChange={e => ul2(l.id, "otros", +e.target.value)} style={INP} /></td>
              <td style={{ ...TD, fontWeight: 600, color: "#DC2626" }}>{fmtL(c.tDed)}</td>
              <td style={{ ...TD, fontWeight: 700, color: "#059669" }}>{fmtL(c.neto)}</td>
              <td style={TD}><input value={l.nota || ""} onChange={e => ul2(l.id, "nota", e.target.value)} style={{ ...INP, width: 90, textAlign: "left" }} placeholder="..." /></td>
            </tr>; })}</tbody>
            <tfoot><tr style={{ background: "#F1F5F9", fontWeight: 700, fontSize: 11 }}>
              <td colSpan={3} style={{ padding: "8px 10px", textAlign: "right" }}>TOTALES:</td>
              <td style={{ padding: "8px 10px" }}>{fmtL(sums.sb)}</td>
              <td style={{ padding: "8px 10px", color: "#059669" }}>{sums.dias}</td>
              <td style={{ padding: "8px 10px", color: "#DC2626" }}>{sums.nsp}</td>
              <td style={{ padding: "8px 10px" }}>{sums.dNSP > 0 ? fmtL(sums.dNSP) : ""}</td>
              <td style={{ padding: "8px 10px" }}>{fmtL(sums.so)}</td>
              <td style={{ padding: "8px 10px", color: "#7C3AED" }}>{sums.dom || ""}</td>
              <td style={{ padding: "8px 10px", color: "#7C3AED" }}>{sums.bdom > 0 ? fmtL(sums.bdom) : ""}</td>
              <td style={{ padding: "8px 10px", color: "#9A3412" }}>{sums.fer || ""}</td>
              <td style={{ padding: "8px 10px", color: "#9A3412" }}>{sums.bfer > 0 ? fmtL(sums.bfer) : ""}</td>
              <td style={{ padding: "8px 10px" }}>{fmtL(sums.bq)}</td>
              <td style={{ padding: "8px 10px" }}>{fmtL(sums.oi)}</td>
              {is2Q && <><td style={{ padding: "8px 10px" }}>{fmtL(sums.isr)}</td><td style={{ padding: "8px 10px" }}>{fmtL(sums.ihss)}</td><td style={{ padding: "8px 10px" }}>{fmtL(sums.rap)}</td><td style={{ padding: "8px 10px" }}>{fmtL(sums.coop)}</td></>}
              <td style={{ padding: "8px 10px" }}>{fmtL(sums.otros)}</td>
              <td style={{ padding: "8px 10px", color: "#DC2626" }}>{fmtL(sums.tDed)}</td>
              <td style={{ padding: "8px 10px", color: "#059669", fontSize: 13 }}>{fmtL(sums.neto)}</td>
              <td></td>
            </tr></tfoot>
          </table>
        </div>
      </div>;
    };

    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E2E8F0", padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {co === "geotecnica" && <div style={{ width: 48, height: 48, borderRadius: 10, background: "linear-gradient(135deg, #E67E22, #D35400)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 22 }}>G</div>}
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#1E293B" }}>{cc.name.toUpperCase()}</div>
              <div style={{ fontSize: 14, color: "#64748b" }}>Planilla de Sueldos y Salarios</div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: cc.color }}>{p.quincena === "1Q" ? "Primera" : "Segunda"} Quincena</div>
            <div style={{ fontSize: 14, color: "#64748b" }}>{new Date(p.periodo + "-01").toLocaleDateString("es-HN", { month: "long", year: "numeric" }).replace(/^\w/, c => c.toUpperCase())}</div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "2px solid #E2E8F0", paddingTop: 12 }}>
          <span style={{ fontWeight: 700, color: "#065F46", fontSize: 18 }}>Total Neto: {fmtL(totalNeto)}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn small variant="ghost" onClick={doExcel}>📊 Descargar Excel</Btn>
            <Btn small variant="ghost" onClick={doPDF}>🖨️ Descargar PDF</Btn>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {Object.entries(projCosts).sort((a, b) => b[1].neto - a[1].neto).map(([pr, d]) => {
          const pj = PROJECTS.find(x => x.short === pr);
          return <div key={pr} style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10, padding: "10px 16px", minWidth: 150 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: cc.color }}>{pr}</div>
            {pj && <div style={{ fontSize: 9, color: "#94A3B8" }}>[{pj.code}]</div>}
            <div style={{ fontSize: 16, fontWeight: 700, color: "#059669" }}>{fmtL(d.neto)}</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>{d.count} personas</div>
          </div>;
        })}
      </div>

      {renderBlock(permL, "PERMANENTES", "#2563EB")}
      {renderBlock(tempL, "TEMPORALES", "#D97706")}
      {renderBlock(honL, "HONORARIOS", "#7C3AED")}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Btn variant="ghost" onClick={() => setModal(null)}>Cerrar</Btn>
        <Btn variant="success" onClick={() => {
          const updated = { ...p, total: +totalNeto.toFixed(2), lines: lines.map(l => ({ ...l, ...calc2(l) })) };
          sP(pays.map(x => x.id === p.id ? updated : x));
          alert("Planilla actualizada");
        }}>Guardar cambios</Btn>
      </div>
    </div>;
  };

  // ── MOVIMIENTOS (Altas y Bajas) ──
  const AltaForm = ({ onSave }) => {
    const [f, setF] = useState({
      company: co, fullName: "", dni: "", position: "", department: "Operaciones",
      contractType: "permanent", startDate: new Date().toISOString().slice(0, 10),
      endDate: "", salary: "", bonificacion: 0, motivo: "Contratacion nueva", notas: "",
    });
    const u = (k, v) => setF(p => ({ ...p, [k]: v }));
    const grupo = getGrupo(f.company, f.contractType);
    return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <Select label="Empresa" options={[{ value: "subterra", label: "Subterra Honduras" }, { value: "geotecnica", label: "Geotecnica Soluciones" }]} value={f.company} onChange={e => u("company", e.target.value)} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>Grupo (auto)</label>
        <div style={{ padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: 8, background: GRUPO_COLOR[grupo] + "15", color: GRUPO_COLOR[grupo], fontWeight: 700, fontSize: 14 }}>
          {grupo} — {GRUPO_DESC[grupo] || "—"}
        </div>
      </div>
      <Input label="Nombre completo" value={f.fullName} onChange={e => u("fullName", e.target.value)} />
      <Input label="DNI / Identidad" value={f.dni} onChange={e => u("dni", e.target.value)} />
      <Input label="Posicion / Cargo" value={f.position} onChange={e => u("position", e.target.value)} />
      <Select label="Departamento" options={DEPARTMENTS} value={f.department} onChange={e => u("department", e.target.value)} />
      <Select label="Tipo de contrato" options={[{ value: "permanent", label: "Permanente" }, { value: "temporary", label: "Temporal" }, { value: "honorarios", label: "Honorarios" }]} value={f.contractType} onChange={e => u("contractType", e.target.value)} />
      <Input label="Fecha de ingreso" type="date" value={f.startDate} onChange={e => u("startDate", e.target.value)} />
      {f.contractType === "temporary" && <Input label="Duracion / Fecha fin" type="date" value={f.endDate} onChange={e => u("endDate", e.target.value)} />}
      <Input label="Salario bruto (L)" type="number" value={f.salary} onChange={e => u("salary", e.target.value)} />
      <Input label="Bonificacion (L)" type="number" value={f.bonificacion} onChange={e => u("bonificacion", e.target.value)} />
      <Select label="Motivo de alta" options={MOTIVOS_ALTA} value={f.motivo} onChange={e => u("motivo", e.target.value)} />
      <div style={{ gridColumn: "1/-1" }}>
        <Input label="Notas" value={f.notas} onChange={e => u("notas", e.target.value)} />
      </div>
      <div style={{ gridColumn: "1/-1", display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
        <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
        <Btn variant="success" onClick={() => {
          if (!f.fullName || !f.dni || !f.startDate || !f.salary) return alert("Complete nombre, DNI, fecha de ingreso y salario");
          if (f.contractType === "temporary" && !f.endDate) return alert("Indique fecha de fin del contrato temporal");
          const empId = uid();
          const newEmp = {
            id: empId, company: f.company, fullName: f.fullName, dni: f.dni, position: f.position,
            department: f.department, contractType: f.contractType, startDate: f.startDate,
            endDate: f.endDate || "", salary: Number(f.salary), bonificacion: Number(f.bonificacion) || 0,
            cooperativa: 0, gastosMedicos: 40000, status: "active", phone: "", email: "",
          };
          sE([...emps, newEmp]);
          const mov = {
            id: uid(), tipo: "alta", company: f.company, employeeId: empId,
            fullName: f.fullName, dni: f.dni, position: f.position, contractType: f.contractType,
            grupo: getGrupo(f.company, f.contractType), salary: Number(f.salary), endDate: f.endDate || "",
            date: f.startDate, motivo: f.motivo, notas: f.notas, createdAt: new Date().toISOString(),
          };
          sM([...movs, mov]);
          setModal(null);
        }}>Registrar alta</Btn>
      </div>
    </div>;
  };

  const BajaForm = ({ onSave }) => {
    const [f, setF] = useState({
      employeeId: "", date: new Date().toISOString().slice(0, 10),
      motivo: "Renuncia voluntaria", notas: "",
    });
    const u = (k, v) => setF(p => ({ ...p, [k]: v }));
    const emp = ce.find(x => x.id === f.employeeId);
    const grupo = emp ? getGrupo(emp.company, emp.contractType) : "—";
    return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <div style={{ gridColumn: "1/-1" }}>
        <Select label="Empleado a dar de baja" options={ae.map(e => ({ value: e.id, label: `${e.fullName} — ${e.position}` }))} value={f.employeeId} onChange={e => u("employeeId", e.target.value)} />
      </div>
      {emp && <div style={{ gridColumn: "1/-1", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, fontSize: 13 }}>
        <div><span style={{ color: "#64748b" }}>DNI:</span> <b>{emp.dni}</b></div>
        <div><span style={{ color: "#64748b" }}>Cargo:</span> <b>{emp.position}</b></div>
        <div><span style={{ color: "#64748b" }}>Empresa:</span> <b>{COMPANIES[emp.company].name}</b></div>
        <div><span style={{ color: "#64748b" }}>Contrato:</span> <Badge color={emp.contractType === "temporary" ? "#D97706" : emp.contractType === "honorarios" ? "#7C3AED" : "#2563EB"}>{emp.contractType === "temporary" ? "Temporal" : emp.contractType === "honorarios" ? "Honorarios" : "Permanente"}</Badge></div>
        <div><span style={{ color: "#64748b" }}>Salario:</span> <b>{fmtL(emp.salary)}</b></div>
        <div><span style={{ color: "#64748b" }}>Grupo:</span> <Badge color={GRUPO_COLOR[grupo]}>{grupo} — {GRUPO_DESC[grupo]}</Badge></div>
      </div>}
      <Input label="Fecha de baja" type="date" value={f.date} onChange={e => u("date", e.target.value)} />
      <Select label="Motivo de baja" options={MOTIVOS_BAJA} value={f.motivo} onChange={e => u("motivo", e.target.value)} />
      <div style={{ gridColumn: "1/-1" }}>
        <Input label="Notas / Observaciones" value={f.notas} onChange={e => u("notas", e.target.value)} />
      </div>
      <div style={{ gridColumn: "1/-1", display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
        <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
        <Btn variant="danger" onClick={() => {
          if (!emp) return alert("Seleccione un empleado");
          if (!f.date) return alert("Indique fecha de baja");
          sE(emps.map(x => x.id === emp.id ? { ...x, status: "inactive", endDate: f.date } : x));
          const mov = {
            id: uid(), tipo: "baja", company: emp.company, employeeId: emp.id,
            fullName: emp.fullName, dni: emp.dni, position: emp.position, contractType: emp.contractType,
            grupo: getGrupo(emp.company, emp.contractType), salary: Number(emp.salary) || 0, endDate: emp.endDate || "",
            date: f.date, motivo: f.motivo, notas: f.notas, createdAt: new Date().toISOString(),
          };
          sM([...movs, mov]);
          setModal(null);
        }}>Registrar baja</Btn>
      </div>
    </div>;
  };

  const renderMovs = () => {
    const [filterPer, filterQ] = [movsFilter.periodo, movsFilter.quincena];
    const filtered = cmov.filter(m => {
      if (!filterPer) return true;
      const q = getQuincena(m.date);
      if (q.periodo !== filterPer) return false;
      if (filterQ && q.quincena !== filterQ) return false;
      return true;
    });
    const altas = filtered.filter(m => m.tipo === "alta");
    const bajas = filtered.filter(m => m.tipo === "baja");

    const exportMovsCSV = () => {
      const headers = ["Tipo", "Fecha", "Quincena", "Grupo", "Nombre", "DNI", "Posicion", "Empresa", "Contrato", "Salario", "Motivo", "Notas"];
      const rows = filtered.map(m => {
        const q = getQuincena(m.date);
        return [m.tipo.toUpperCase(), m.date, `${q.quincena} ${q.periodo}`, m.grupo, '"' + m.fullName + '"', m.dni, '"' + (m.position || "") + '"',
          COMPANIES[m.company]?.name || "", m.contractType, m.salary, '"' + (m.motivo || "") + '"', '"' + (m.notas || "") + '"'].join(",");
      });
      const csv = [headers.join(","), ...rows].join("\n");
      const a = document.createElement("a");
      a.href = "data:text/csv;charset=utf-8," + encodeURIComponent("\uFEFF" + csv);
      a.download = `Movimientos_${cc.name.replace(/ /g, "_")}_${filterPer || "todos"}${filterQ ? "_" + filterQ : ""}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };

    const exportMovsPDF = () => {
      const titulo = `Reporte de Movimientos — ${cc.name.toUpperCase()}`;
      const sub = filterPer ? `Periodo: ${filterQ || ""} ${filterPer}` : "Todos los periodos";
      const renderRows = (rows, color) => rows.map(m => {
        const q = getQuincena(m.date);
        return `<tr><td style='background:${color};color:#fff;font-weight:bold;text-align:center'>${m.tipo.toUpperCase()}</td><td>${m.date}</td><td>${q.quincena}</td><td style='text-align:center;font-weight:bold;background:${GRUPO_COLOR[m.grupo]}22;color:${GRUPO_COLOR[m.grupo]}'>${m.grupo}</td><td>${m.fullName}</td><td>${m.dni}</td><td>${m.position || ""}</td><td>${COMPANIES[m.company]?.name || ""}</td><td>${m.contractType}</td><td style='text-align:right'>L ${Number(m.salary || 0).toLocaleString("es-HN", { minimumFractionDigits: 2 })}</td><td>${m.motivo || ""}</td><td>${m.notas || ""}</td></tr>`;
      }).join("");
      const w = window.open("", "_blank");
      if (!w) { alert("Permite popups para imprimir"); return; }
      w.document.write("<!DOCTYPE html><html><head><meta charset='utf-8'><title>" + titulo + "</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;padding:30px}h1{font-size:18px}h2{font-size:13px;color:#666;margin:6px 0 10px}h3{font-size:14px;margin:18px 0 6px}table{border-collapse:collapse;width:100%;margin-top:8px}th,td{border:1px solid #ccc;padding:5px 8px;font-size:10px;text-align:left}th{background:#eee}.np{margin-top:18px}@media print{.np{display:none}}</style></head><body>");
      w.document.write("<h1>" + titulo + "</h1><h2>" + sub + "</h2>");
      w.document.write(`<p style='font-size:12px'><b>Total altas:</b> ${altas.length} &nbsp;|&nbsp; <b>Total bajas:</b> ${bajas.length}</p>`);
      if (altas.length > 0) {
        w.document.write("<h3 style='color:#059669'>ALTAS (" + altas.length + ")</h3>");
        w.document.write("<table><thead><tr><th>Tipo</th><th>Fecha</th><th>Q</th><th>Grupo</th><th>Nombre</th><th>DNI</th><th>Posicion</th><th>Empresa</th><th>Contrato</th><th>Salario</th><th>Motivo</th><th>Notas</th></tr></thead><tbody>" + renderRows(altas, "#059669") + "</tbody></table>");
      }
      if (bajas.length > 0) {
        w.document.write("<h3 style='color:#DC2626'>BAJAS (" + bajas.length + ")</h3>");
        w.document.write("<table><thead><tr><th>Tipo</th><th>Fecha</th><th>Q</th><th>Grupo</th><th>Nombre</th><th>DNI</th><th>Posicion</th><th>Empresa</th><th>Contrato</th><th>Salario</th><th>Motivo</th><th>Notas</th></tr></thead><tbody>" + renderRows(bajas, "#DC2626") + "</tbody></table>");
      }
      // Resumen por grupo
      const grupoStats = {};
      ["A", "B", "C", "D"].forEach(g => grupoStats[g] = { altas: 0, bajas: 0 });
      filtered.forEach(m => { if (grupoStats[m.grupo]) grupoStats[m.grupo][m.tipo === "alta" ? "altas" : "bajas"]++; });
      w.document.write("<h3>Resumen por Grupo</h3><table><thead><tr><th>Grupo</th><th>Descripcion</th><th>Altas</th><th>Bajas</th><th>Neto</th></tr></thead><tbody>");
      ["A", "B", "C", "D"].forEach(g => {
        const s = grupoStats[g];
        w.document.write(`<tr><td style='font-weight:bold;background:${GRUPO_COLOR[g]}22;color:${GRUPO_COLOR[g]};text-align:center'>${g}</td><td>${GRUPO_DESC[g]}</td><td style='color:#059669;font-weight:bold;text-align:center'>${s.altas}</td><td style='color:#DC2626;font-weight:bold;text-align:center'>${s.bajas}</td><td style='font-weight:bold;text-align:center'>${s.altas - s.bajas >= 0 ? "+" : ""}${s.altas - s.bajas}</td></tr>`);
      });
      w.document.write("</tbody></table>");
      w.document.write("<button class='np' onclick='window.print()' style='padding:10px 24px;font-size:14px;cursor:pointer;background:#059669;color:white;border:none;border-radius:8px'>Imprimir / Guardar como PDF</button></body></html>");
      w.document.close();
    };

    // Stats por grupo
    const grupoStats = { A: { altas: 0, bajas: 0 }, B: { altas: 0, bajas: 0 }, C: { altas: 0, bajas: 0 }, D: { altas: 0, bajas: 0 } };
    filtered.forEach(m => { if (grupoStats[m.grupo]) grupoStats[m.grupo][m.tipo === "alta" ? "altas" : "bajas"]++; });

    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
          <div style={{ minWidth: 160 }}>
            <Input label="Filtrar por mes" type="month" value={filterPer} onChange={e => setMovsFilter(s => ({ ...s, periodo: e.target.value }))} />
          </div>
          <div style={{ minWidth: 140 }}>
            <Select label="Quincena" options={[{ value: "1Q", label: "1Q (1-15)" }, { value: "2Q", label: "2Q (16-31)" }]} value={filterQ} onChange={e => setMovsFilter(s => ({ ...s, quincena: e.target.value }))} />
          </div>
          {(filterPer || filterQ) && <Btn small variant="ghost" onClick={() => setMovsFilter({ periodo: "", quincena: "" })}>Limpiar</Btn>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="success" onClick={() => setModal({ t: "mn" })}>+ Alta</Btn>
          <Btn variant="danger" onClick={() => setModal({ t: "mb" })}>+ Baja</Btn>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <StatCard icon="📈" label="Altas" value={altas.length} color="#059669" />
        <StatCard icon="📉" label="Bajas" value={bajas.length} color="#DC2626" />
        <StatCard icon="⚖️" label="Neto" value={(altas.length - bajas.length >= 0 ? "+" : "") + (altas.length - bajas.length)} color={altas.length - bajas.length >= 0 ? "#059669" : "#DC2626"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        {["A", "B", "C", "D"].map(g => {
          const s = grupoStats[g];
          const neto = s.altas - s.bajas;
          return <div key={g} style={{ background: "#fff", border: "1px solid #E2E8F0", borderLeft: `4px solid ${GRUPO_COLOR[g]}`, borderRadius: 10, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontWeight: 800, fontSize: 18, color: GRUPO_COLOR[g] }}>Grupo {g}</div>
              <Badge color={GRUPO_COLOR[g]}>{neto >= 0 ? "+" : ""}{neto}</Badge>
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>{GRUPO_DESC[g]}</div>
            <div style={{ display: "flex", gap: 12, fontSize: 13 }}>
              <span style={{ color: "#059669", fontWeight: 700 }}>↑ {s.altas}</span>
              <span style={{ color: "#DC2626", fontWeight: 700 }}>↓ {s.bajas}</span>
            </div>
          </div>;
        })}
      </div>

      {altas.length > 0 && <div>
        <div style={{ background: "#059669", color: "#fff", padding: "8px 14px", fontWeight: 700, fontSize: 13, borderRadius: "10px 10px 0 0" }}>
          ALTAS ({altas.length})
        </div>
        <Table columns={[
          { key: "date", label: "Fecha", render: r => fmt(r.date) },
          { key: "q", label: "Q", render: r => { const q = getQuincena(r.date); return <Badge color="#0891B2">{q.quincena}</Badge>; } },
          { key: "grupo", label: "Grupo", render: r => <Badge color={GRUPO_COLOR[r.grupo]}>{r.grupo}</Badge> },
          { key: "fullName", label: "Nombre" },
          { key: "dni", label: "DNI" },
          { key: "position", label: "Posicion" },
          { key: "contractType", label: "Contrato", render: r => <Badge color={r.contractType === "temporary" ? "#D97706" : r.contractType === "honorarios" ? "#7C3AED" : "#2563EB"}>{r.contractType === "temporary" ? "Temporal" : r.contractType === "honorarios" ? "Honorarios" : "Permanente"}</Badge> },
          { key: "salary", label: "Salario", render: r => fmtL(r.salary) },
          { key: "motivo", label: "Motivo" },
        ]} data={altas.slice().reverse()} actions={r => <Btn small variant="danger" onClick={() => { if (confirm(`Eliminar registro de alta de ${r.fullName}?`)) sM(movs.filter(m => m.id !== r.id)); }}>×</Btn>} />
      </div>}

      {bajas.length > 0 && <div>
        <div style={{ background: "#DC2626", color: "#fff", padding: "8px 14px", fontWeight: 700, fontSize: 13, borderRadius: "10px 10px 0 0" }}>
          BAJAS ({bajas.length})
        </div>
        <Table columns={[
          { key: "date", label: "Fecha", render: r => fmt(r.date) },
          { key: "q", label: "Q", render: r => { const q = getQuincena(r.date); return <Badge color="#0891B2">{q.quincena}</Badge>; } },
          { key: "grupo", label: "Grupo", render: r => <Badge color={GRUPO_COLOR[r.grupo]}>{r.grupo}</Badge> },
          { key: "fullName", label: "Nombre" },
          { key: "dni", label: "DNI" },
          { key: "position", label: "Posicion" },
          { key: "contractType", label: "Contrato", render: r => <Badge color={r.contractType === "temporary" ? "#D97706" : r.contractType === "honorarios" ? "#7C3AED" : "#2563EB"}>{r.contractType === "temporary" ? "Temporal" : r.contractType === "honorarios" ? "Honorarios" : "Permanente"}</Badge> },
          { key: "motivo", label: "Motivo" },
          { key: "notas", label: "Notas" },
        ]} data={bajas.slice().reverse()} actions={r => <Btn small variant="danger" onClick={() => { if (confirm(`Eliminar registro de baja de ${r.fullName}?`)) sM(movs.filter(m => m.id !== r.id)); }}>×</Btn>} />
      </div>}

      {filtered.length === 0 && <div style={{ background: "#F8FAFC", border: "1px dashed #CBD5E1", borderRadius: 12, padding: 30, textAlign: "center", color: "#94A3B8" }}>
        Sin movimientos en el periodo seleccionado.
      </div>}

      {filtered.length > 0 && <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Btn small variant="ghost" onClick={exportMovsCSV}>📊 Descargar CSV</Btn>
        <Btn small variant="ghost" onClick={exportMovsPDF}>🖨️ Imprimir / PDF</Btn>
      </div>}
    </div>;
  };

  const renderSec = () => { switch (sec) { case "employees": return renderEmps(); case "payroll": return renderPayroll(); case "vacations": return renderVacs(); case "leaves": return renderLvs(); case "attendance": return renderAtts(); case "movimientos": return renderMovs(); case "constancias": return renderCons(); default: return renderDashboard(); } };

  const renderModal = () => { if (!modal) return null; const m = modal; switch (m.t) {
    case "en": return <Modal title="Nuevo empleado" onClose={() => setModal(null)} wide><EmpForm onSave={e => sE([...emps, e])} /></Modal>;
    case "ee": return <Modal title="Editar empleado" onClose={() => setModal(null)} wide><EmpForm emp={m.d} onSave={e => sE(emps.map(x => x.id === e.id ? e : x))} /></Modal>;
    case "pn": return <Modal title={`Planilla — ${cc.name}`} onClose={() => setModal(null)} wide><PayrollGen /></Modal>;
    case "pd": return <Modal title={`Planilla ${m.d.quincena} ${m.d.periodo}`} onClose={() => setModal(null)} wide><PayDetail p={m.d} /></Modal>;
    case "vn": return <Modal title="Vacaciones" onClose={() => setModal(null)}><VacForm onSave={v => sV([...vacs, v])} /></Modal>;
    case "ve": return <Modal title="Editar vacaciones" onClose={() => setModal(null)}><VacForm vac={m.d} onSave={v => sV(vacs.map(x => x.id === v.id ? v : x))} /></Modal>;
    case "ln": return <Modal title="Permiso" onClose={() => setModal(null)}><LvForm onSave={l => sL([...lvs, l])} /></Modal>;
    case "le": return <Modal title="Editar permiso" onClose={() => setModal(null)}><LvForm lv={m.d} onSave={l => sL(lvs.map(x => x.id === l.id ? l : x))} /></Modal>;
    case "cuad": return <Modal title={`Distribucion de cuadrilla — ${cc.name}`} onClose={() => setModal(null)} wide><CuadrillaForm /></Modal>;
    case "cuad-edit": return <Modal title={`Editar cuadrilla — ${cc.name}`} onClose={() => setModal(null)} wide><CuadrillaForm /></Modal>;
    case "ag": return <Modal title={`Asistencia ${m.d.quincena} ${m.d.periodo}`} onClose={() => setModal(null)} wide><AttendanceGrid sheet={m.d} /></Modal>;
    case "mn": return <Modal title="Registrar ALTA de empleado" onClose={() => setModal(null)} wide><AltaForm /></Modal>;
    case "mb": return <Modal title="Registrar BAJA de empleado" onClose={() => setModal(null)} wide><BajaForm /></Modal>;
    case "cn": return <Modal title="Constancia" onClose={() => setModal(null)} wide><ConForm /></Modal>;
    default: return null;
  }};

  return <div style={{ display: "flex", height: "100vh", fontFamily: "inherit", background: BEIGE, color: CHARCOAL }}>
    <div style={{ width: sb ? 240 : 60, background: DARK_BG, color: "#F0EBE3", transition: "width .2s", overflow: "hidden", display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ padding: sb ? "20px 16px" : "20px 12px", borderBottom: `1px solid ${DARK_BORDER}`, display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => setSb(!sb)} style={{ background: "none", border: "none", color: "#A8A096", fontSize: 20, cursor: "pointer", flexShrink: 0 }}>☰</button>
        {sb && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Logo size={28} showText={false} />
            <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: 1.5, color: "#F0EBE3", marginTop: 4 }}>GEOTECNICA</div>
            <div style={{ fontSize: 9, letterSpacing: 2, color: "#A8A096", fontWeight: 600 }}>SOLUCIONES · RRHH</div>
          </div>
        )}
      </div>
      {sb && <div style={{ padding: "14px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
        {Object.entries(COMPANIES).map(([k, v]) => <button key={k} onClick={() => setCo(k)} style={{ background: co === k ? v.accent : "transparent", color: co === k ? "#fff" : "#A8A096", border: co === k ? "none" : `1px solid ${DARK_BORDER}`, borderRadius: 8, padding: "9px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600, textAlign: "left", fontFamily: "inherit", transition: "all .15s" }}>{v.name}</button>)}
      </div>}
      <div style={{ padding: "8px 0", flex: 1 }}>
        {nav.map(n => <button key={n.id} onClick={() => setSec(n.id)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: sb ? "11px 20px" : "11px 18px", background: sec === n.id ? "rgba(232,118,45,0.18)" : "transparent", border: "none", color: sec === n.id ? "#fff" : "#A8A096", cursor: "pointer", fontSize: 14, textAlign: "left", borderLeft: sec === n.id ? `3px solid ${ORANGE}` : "3px solid transparent", fontFamily: "inherit", fontWeight: sec === n.id ? 600 : 500, transition: "all .15s" }}><span style={{ fontSize: 18, flexShrink: 0 }}>{n.icon}</span>{sb && <span>{n.label}</span>}</button>)}
      </div>
      {sb && <div style={{ padding: "12px", borderTop: `1px solid ${DARK_BORDER}`, display: "flex", flexDirection: "column", gap: 6 }}>
        {onBack && <button onClick={onBack} style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${DARK_BORDER}`, borderRadius: 8, color: "#A8A096", padding: "9px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, textAlign: "left", fontFamily: "inherit" }}>← Volver al panel</button>}
        {onLogout && <button onClick={onLogout} style={{ background: "rgba(192,57,43,0.15)", border: "1px solid rgba(192,57,43,0.4)", borderRadius: 8, color: "#F0AAA0", padding: "9px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, textAlign: "left", fontFamily: "inherit" }}>Cerrar sesion</button>}
        <div style={{ fontSize: 11, color: "#7A7268", marginTop: 4, fontWeight: 500, lineHeight: 1.4 }}>{userName || "Lic. Gerson Trochez"}<br /><span style={{ color: ORANGE, fontWeight: 600 }}>Recursos Humanos</span></div>
      </div>}
    </div>
    <div style={{ flex: 1, overflow: "auto" }}>
      <div style={{ padding: "22px 32px", borderBottom: `1px solid ${BORDER}`, background: CREAM, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: CHARCOAL, letterSpacing: -0.3 }}>{nav.find(n => n.id === sec)?.label}</h2>
          <span style={{ fontSize: 13, color: cc.accent, fontWeight: 600, letterSpacing: 0.3 }}>{cc.name}</span>
        </div>
        <Badge color={cc.color}>{ae.length} activos</Badge>
      </div>
      <div style={{ padding: 28 }}>
        {isReadOnly && (
          <div style={{ background: "#EFF6FF", border: "1px solid #93C5FD", color: "#1E40AF", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
            👁️ Modo solo lectura — podés ver toda la información pero no editar ni guardar cambios.
          </div>
        )}
        <fieldset disabled={isReadOnly} style={{ border: "none", padding: 0, margin: 0, minWidth: 0 }}>
          {renderSec()}
        </fieldset>
      </div>
    </div>
    {!isReadOnly && renderModal()}
  </div>;
}
