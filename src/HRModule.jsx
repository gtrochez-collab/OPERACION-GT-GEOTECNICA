import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { store } from "./supabase.js";
import Logo from "./Logo.jsx";
import { PROJECTS as CANONICAL_PROJECTS, findProject, resolveShort, projectName, projectCode } from "./projects.js";
import { esFeriadoQuincena, nombreFeriado } from "./holidays.js";
import { hoyISO } from "./fechas.js";
// GT_CSS (vidrio): desde el 15-oct-2026 lo monta TODO GeoTeam (rediseño de
// encabezado, Dashboard, KPI's y Empleados).
import { GT_CSS } from "./gt-ui.js";
import { reporteHTML, abrirReporte, rKpis, rSeccion, rSeccionProyecto, rProyecto, pastelesDe, rTabla, rChip, rBarra, rDona, colorPaleta, RP, escHTML, fmtLps, libroExcel, hojaExcel, descargarExcel } from "./reporte-estilo.js";
import { USERS, ROLE_LABEL, ROLES_ASIGNABLES, USUARIOS_DE_BAJA } from "./users.js";
import { estadoLabel as estadoLabelInv, categoriaDe as categoriaInv } from "./geoinventory-calc.js";
// Planilla (16-oct-2026): lógica pura + PDF/Excel.
import { diasDeQuincena, quincenaAnterior as quincenaAnteriorPl, quincenaSiguiente, nombreQuincena, rangoQuincena, etiquetaCorta, asistenciaDe, rachaIncapAlCierre, horasExtrasDe, armarLinea, totalesLinea, lineaParaGuardar, resumenPlanilla, entraEnPlanilla, diasMostrados, lineasConHe, GRUPOS_CT, METODOS_PAGO } from "./planilla-calc.js";
import { exportarPlanillaPDF, exportarPlanillaExcel } from "./planilla-export.js";
// Hub de RRHH (20-oct-2026): portal "Mi RRHH" de cada colaborador + bandeja de
// solicitudes (vacaciones, permisos, constancias, reportes) para RRHH.
import { KEY_SOLICITUDES, KEY_VINCULOS, vincularEmpleado, siguienteFolio, vacacionDeSolicitud, permisosDeSolicitud, constanciaDoc, textoConstancia, estaAbierta, esAprobador as esAprobadorHub, veTodo as veTodoHub, vacacionesTomadas, rangoCorto as rangoCortoHub } from "./rrhh-solicitudes.js";
import { PortalRRHH, BandejaRRHH, SolicitudFormImpl, SolicitudDetalleImpl, ModalHub, ICO as ICO_HUB, GenerarConstanciaImpl, pdfDeRegistroConstancia } from "./rrhh-hub.jsx";

// ── GeoInventory → GeoTeam (13-oct-2026): "Equipo asignado" ────────────────
// Solo lectura: lo que el colaborador tiene a su cargo según inv-items (lee
// SOLO con getCloud; nunca escribe). `modo="aviso"` es la advertencia del form
// de baja: si todavía tiene equipo, que lo devuelva antes de salir.
function EquipoAsignadoInv({ empId, modo = "lista" }) {
  const [lista, setLista] = useState(null);
  useEffect(() => {
    let vivo = true;
    if (!empId) { setLista([]); return; }
    store.getCloud("inv-items").then(arr => { if (vivo) setLista((Array.isArray(arr) ? arr : []).filter(i => i && !i.eliminado && i.tipo === "individual" && i.asignadoA === empId)); }).catch(() => { if (vivo) setLista([]); });
    return () => { vivo = false; };
  }, [empId]);
  if (!empId) return null;
  if (modo === "aviso") {
    if (!lista?.length) return null;
    return <div style={{ gridColumn: "1/-1", background: "#FFF7ED", border: "1px solid #FDBA74", borderRadius: 10, padding: "10px 14px", fontSize: 12.5, color: "#7C2D12", lineHeight: 1.6 }}>
      <b>Tiene {lista.length} equipo{lista.length === 1 ? "" : "s"} asignado{lista.length === 1 ? "" : "s"} en GeoInventory</b> — que lo devuelva antes de salir: {lista.map(i => `${i.codigo} ${i.nombre}`).join(" · ")}. Se marca como devuelto desde la ficha de cada artículo en GeoInventory.
    </div>;
  }
  return <div style={{ gridColumn: "1/-1", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
    <div style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Equipo asignado (GeoInventory) {lista ? `· ${lista.length}` : ""}</div>
    {lista === null && <div style={{ fontSize: 12, color: "#94A3B8" }}>Cargando…</div>}
    {lista && lista.length === 0 && <div style={{ fontSize: 12, color: "#94A3B8" }}>No tiene equipo asignado.</div>}
    {(lista || []).map(i => <div key={i.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}>
      <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 800, fontSize: 11.5, color: "#64748b" }}>{i.codigo}</span>
      <span style={{ flex: 1, fontWeight: 600, color: "#0f172a" }}>{i.nombre}</span>
      <span style={{ fontSize: 11.5, color: "#64748b" }}>{categoriaInv(i.categoria).corto}</span>
      <Badge color={i.estado === "bueno" || i.estado === "disponible" ? "#177243" : i.estado === "regular" || i.estado === "en_operacion" ? "#A94E16" : "#B03024"}>{estadoLabelInv(i)}</Badge>
    </div>)}
  </div>;
}

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

// ── Hook responsive ──
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < breakpoint : false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [breakpoint]);
  return isMobile;
}

const HR_ACCENT = "#2C5F5D";
const HR_ACCENT_DARK = "#1E4A48";

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

// ── ÚLTIMO DÍA EN LA EMPRESA (30-sep-2026, pedido de Gerson) ────────────────
// El `endDate` de un empleado con status "inactive" es el ULTIMO DIA que la
// persona estuvo en la empresa: ese dia SE PAGA (la Lic. Carolina paga hasta
// ahi) y todo lo que viene DESPUES queda bloqueado (gris) en la asistencia —
// domingos y feriados INCLUIDOS, asi que tampoco se le autorrellena el "1" de
// descanso pagado por ley despues de su ultimo dia.
//
// Historia: el 14-sep-2026 se habia cambiado a "dia de baja = primer dia fuera"
// (gris desde la fecha inclusive). Gerson volvio a "ultimo dia": es lo que se
// le dice a Carolina ("hasta este dia se le paga"). Una sola fecha, un solo
// significado, igual en la ficha, en la asistencia, en GeoCost y en el reporte.
//
// OJO: solo aplica con status "inactive". Los temporales ACTIVOS traen un
// endDate de contrato que queda viejo al renovar — ese no bloquea nada.
const fueraPorBaja = (e, dStr) => !!(e && e.status === "inactive" && e.endDate && dStr > e.endDate);

// "2026-09-05" → "2026-09-04". En UTC a proposito: `new Date("2026-09-05")` es
// medianoche UTC y restar en hora local de Honduras (UTC-6) corre otro dia.
const diaAnterior = (dStr) => {
  const ymd = String(dStr || "").slice(0, 10);
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
};

const diaSiguiente = (dStr) => {
  const ymd = String(dStr || "").slice(0, 10);
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

// Devuelve la quincena (1Q/2Q) y periodo (YYYY-MM) de una fecha.
//
// CRITICO: parseamos el string YYYY-MM-DD manualmente en lugar de pasar
// por `new Date(dateStr)`. JavaScript interpreta "2026-05-01" como
// medianoche UTC, y al llamar getDate() en Honduras (UTC-6) devuelve el
// dia anterior (30 de abril), poniendo erroneamente la quincena como 2Q.
// Parseando directo el string evitamos el desfase de timezone.
const getQuincena = (dateStr) => {
  if (!dateStr) return { periodo: "", quincena: "" };
  const ymd = String(dateStr).slice(0, 10);
  const [y, m, day] = ymd.split("-").map(Number);
  if (!y || !m || !day) return { periodo: "", quincena: "" };
  const periodo = `${y}-${String(m).padStart(2, "0")}`;
  const quincena = day <= 15 ? "1Q" : "2Q";
  return { periodo, quincena };
};

// ═══════════════════════════════════════════════════════════════════
// HORARIOS DE TRABAJO + GeoClock (ago 2026)
// ═══════════════════════════════════════════════════════════════════
// Cada empleado puede tener un horario en su ficha (emp.horario). Sin
// horario asignado se asume PLANTEL (7:00–16:00) — es el default histórico
// de la fórmula de pago proporcional (jornada de 8h desde las 7:00).
// Exportados: GeoClockModule usa EXACTAMENTE las mismas reglas para que la
// tolerancia y el descuento nunca difieran entre el reloj y RRHH.
export const HORARIOS = {
  // OJO: la key "plantel" se mantiene por compatibilidad de datos (fichas ya
  // guardadas) — el NOMBRE del horario 7–4 es "Campo" (pedido 18-ago-2026).
  plantel:  { label: "Campo (7:00 – 16:00)",    entrada: "7:00", salida: "16:00" },
  oficina:  { label: "Oficina (8:00 – 17:00)",  entrada: "8:00", salida: "17:00" },
  especial: { label: "Especial (9:00 – 18:00)", entrada: "9:00", salida: "18:00" },
};
// Ventana de tolerancia para marcar entrada sin caer en llegada tarde.
// Aplica a todos los horarios sobre SU hora de entrada (plantel 7:00–7:15,
// oficina 8:00–8:15, etc). Subida de 10 → 15 min (pedido de Gerson,
// 18-ago-2026, tras el arranque en plantel).
export const TOLERANCIA_MIN = 15;
export const horarioDe = (e) => {
  if (e?.horario === "custom" && e?.horarioEntrada) {
    return { label: `Personalizado (${e.horarioEntrada} – ${e.horarioSalida || "?"})`, entrada: e.horarioEntrada, salida: e.horarioSalida || "" };
  }
  return HORARIOS[e?.horario] || HORARIOS.plantel;
};
// Hora de entrada oficial del empleado en horas decimales (7.0, 8.0, 9.5...).
// Es la base del descuento proporcional: cada hora tarde resta 1/8 de la
// jornada, contada desde SU hora oficial (no siempre las 7:00).
export const horaEntradaH = (e) => {
  const [h, mm] = String(horarioDe(e).entrada).split(":").map(Number);
  return (Number.isFinite(h) ? h : 7) + (Number.isFinite(mm) ? mm : 0) / 60;
};
// Hora LÍMITE (fin de la tolerancia) en horas decimales: 8:00 + 15 min = 8.25.
// El atraso se cuenta DESDE ACÁ, no desde la hora de entrada (fix 19-ago-2026
// pedido por Gerson): si el horario es 8:00 y la tolerancia 15 min, quien
// marca 8:20 llegó 5 minutos tarde — no 20. Eso es lo que se le avisa al
// colaborador, lo que sale en Registros y lo que se descuenta si RRHH deniega.
export const horaLimiteH = (e) => horaEntradaH(e) + TOLERANCIA_MIN / 60;
// Minutos de atraso efectivos a partir de la hora marcada ("8:20") y la hora
// de entrada del horario ("8:00"). Se calcula SIEMPRE desde estos dos campos
// —que van guardados en cada marcaje— y no desde el `minTarde` persistido:
// así los marcajes viejos (guardados con la fórmula anterior) se muestran y
// descuentan bien sin migrar datos.
export const minTardeDe = (horaStr, horarioEntradaStr) => {
  const [h, m] = String(horaStr || "").split(":").map(Number);
  const [eh, em] = String(horarioEntradaStr || "7:00").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(eh)) return 0;
  const marcado = h * 60 + (Number.isFinite(m) ? m : 0);
  const limite = eh * 60 + (Number.isFinite(em) ? em : 0) + TOLERANCIA_MIN;
  return Math.max(0, marcado - limite);
};
// Fecha de HOY en zona horaria de Honduras (America/Tegucigalpa, UTC-6 sin
// DST). en-CA formatea YYYY-MM-DD directo. No usar new Date().toISOString()
// para esto: de 6pm en adelante ya es "mañana" en UTC.
export const hoyTegus = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Tegucigalpa", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
// Clave de la data de marcajes GeoClock: un array por quincena (chico y
// acotado — nunca un array global gigante). GeoClock APPENDEA acá; RRHH
// solo LEE (las decisiones de tardanzas viven aparte en gc-tardies).
export const gcMarkKey = (periodo, quincena) => `gc-marks-${periodo}-${quincena}`;
export const quincenaAnterior = (periodo, quincena) => {
  if (quincena === "2Q") return { periodo, quincena: "1Q" };
  const [y, m] = String(periodo).split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return { periodo: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, quincena: "2Q" };
};

// =====================================================================
// SNAPSHOT CONTRACTUAL SUBTERRA — 2026-05-05
// =====================================================================
// Estado contractual vigente al 5 mayo 2026, aprobado por Dr. Raúl Flores.
// Aplicado via boton "📥 Aplicar Snapshot Subterra Mayo 2026" en Contratos.
// Idempotente: si ya existe contrato activo para el empleado, lo preserva.
// =====================================================================
const SUBTERRA_SNAPSHOT_DATE = "2026-05-05";
const SUBTERRA_SNAPSHOT = [
  // Grupo A — Permanentes (tiempo_indefinido)
  { name: "Fernando Jesús Díaz Fernández", dni: "0801-2002-20394", position: "Planner/Gestor-Máquinas", contractType: "permanent", startDate: "2026-05-01", endDate: null, grupo: "A" },
  { name: "Said Antonio Ortiz Alvarado", dni: "0801-2004-03223", position: "Tornero", contractType: "permanent", startDate: "2026-05-01", endDate: null, grupo: "A" },
  // Grupo B — Obra Determinada 1 mes (2026-05-01 → 2026-05-31)
  { name: "Ena Sofía Oliva Medina", dni: "1502-1999-00563", position: "Ingeniero Encargado", contractType: "temporary", startDate: "2026-05-01", endDate: "2026-05-31", grupo: "B" },
  { name: "Ever Alberto Corea Mejía", dni: "0801-2001-12831", position: "Operador de Fiori", contractType: "temporary", startDate: "2026-05-01", endDate: "2026-05-31", grupo: "B" },
  { name: "Exequiel Antonio Sierra Amador", dni: "0816-2002-00083", position: "Técnico C", contractType: "temporary", startDate: "2026-05-01", endDate: "2026-05-31", grupo: "B" },
  { name: "José Miguel Rodríguez Medina", dni: "0801-1989-13061", position: "Técnico C", contractType: "temporary", startDate: "2026-05-01", endDate: "2026-05-31", grupo: "B" },
  { name: "José David Tinoco Flores", dni: "0801-2003-08328", position: "Técnico C", contractType: "temporary", startDate: "2026-05-01", endDate: "2026-05-31", grupo: "B" },
  { name: "Ricardo David Benavides García", dni: "0801-1964-00775", position: "Mecánico", contractType: "temporary", startDate: "2026-05-01", endDate: "2026-05-31", grupo: "B" },
  { name: "Yeferson Javier Castillo Hernández", dni: "0801-2007-01751", position: "Técnico C", contractType: "temporary", startDate: "2026-05-01", endDate: "2026-05-31", grupo: "B" },
  { name: "Rolando Josué Mendoza Sánchez", dni: "0801-2003-08130", position: "Técnico C", contractType: "temporary", startDate: "2026-05-01", endDate: "2026-05-31", grupo: "B" },
  { name: "Daniel Alexander López Servellón", dni: "0801-1998-23225", position: "Técnico C", contractType: "temporary", startDate: "2026-05-01", endDate: "2026-05-31", grupo: "B" },
  { name: "Alejandro Miguel Fonseca Lagos", dni: "0801-2002-11647", position: "Asistente Administrativo", contractType: "temporary", startDate: "2026-05-01", endDate: "2026-05-31", grupo: "B" },
  { name: "Ivonne Alejandra Cruz Coello", dni: "0801-1989-09104", position: "Ingeniera Asistente de Oficina Técnica", contractType: "temporary", startDate: "2026-05-01", endDate: "2026-05-31", grupo: "B" },
  // Grupo B — Obra Determinada 2 meses (alta 2026-04-21)
  { name: "Henry Armando Rodríguez Vallecillo", dni: "0801-2006-11434", position: "Técnico C", contractType: "temporary", startDate: "2026-04-21", endDate: "2026-06-21", grupo: "B" },
  { name: "Junior Josué Zambrano Zambrano", dni: "0801-2001-15434", position: "Motorista / Técnico C", contractType: "temporary", startDate: "2026-04-21", endDate: "2026-06-21", grupo: "B" },
  // Grupo B — Obra Determinada 2 meses (alta 2026-05-01) — NUEVO INGRESO
  { name: "Yony Leonel Sandoval Hernández", dni: "0801-2002-05225", position: "Técnico C", contractType: "temporary", startDate: "2026-05-01", endDate: "2026-07-01", grupo: "B", isNew: true, salary: 13000 },
];

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

// ── Avatar helpers ──
// Iniciales y color de un empleado a partir de su nombre (fallback cuando no
// tiene foto subida). Replica la logica de users.js sin importarla porque
// aca los "labels" son nombres completos y no usernames.
const empInitials = (fullName) => {
  if (!fullName) return "?";
  const clean = String(fullName).replace(/^(Lic\.|Ing\.|Sr\.|Sra\.|Dr\.)\s+/i, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length > 2 ? 2 : 1][0]).toUpperCase();
};
const empColor = (seed) => {
  // Paleta GeoCore (15-oct-2026): carbón, naranjas y grises — sin el arcoíris de antes.
  const palette = ["#2C2A28", "#E8762D", "#5C5853", "#C75F1F", "#8C857D", "#3A3633", "#A9542A", "#6E6862"];
  if (!seed) return "#64748b";
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
};

// Avatar reutilizable: si hay dataUrl la muestra, si no cae al circulo de
// iniciales con color derivado del nombre. Tamano configurable (px).
const EmpAvatar = ({ name, dataUrl, size = 90, borderRadius = "50%", style: sx, suave = false }) => {
  const st = { width: size, height: size, borderRadius, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", ...(sx || {}) };
  if (dataUrl) {
    return <div style={{ ...st, background: "#F1F5F9" }}>
      <img src={dataUrl} alt={name || ""} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    </div>;
  }
  // suave: iniciales en gris clarito (listas donde el color de fondo pesa).
  if (suave) return <div style={{ ...st, background: "rgba(44,42,40,.07)", color: "#6E6862", fontWeight: 700, fontSize: size * 0.36, letterSpacing: 0.5 }}>{empInitials(name)}</div>;
  const bg = empColor(name);
  return <div style={{ ...st, background: bg, color: "#fff", fontWeight: 700, fontSize: size * 0.36, letterSpacing: 0.5 }}>{empInitials(name)}</div>;
};
// Formatea una fecha "YYYY-MM-DD" (o ISO con timestamp) a "15 may 2026".
// Parseamos los componentes manualmente para evitar el desfase de timezone
// que hace que new Date("2026-05-01") devuelva "30 abr" en zonas UTC negativas.
const fmt = (d) => {
  if (!d) return "—";
  const ymd = String(d).slice(0, 10);
  const [y, mo, day] = ymd.split("-").map(Number);
  if (!y || !mo || !day) return d;
  return new Date(y, mo - 1, day).toLocaleDateString("es-HN", { day: "2-digit", month: "short", year: "numeric" });
};
// maximumFractionDigits: sin esto los acumuladores flotantes mostraban
// montos con 3 decimales (ej. "L 86,154.893" en Costos MO).
const fmtL = n => n != null && n !== "" && n !== 0 ? `L ${Number(n).toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "L 0.00";
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
// Buscador de colaborador (29-oct-2026): reemplaza el <select> nativo en los
// forms anchos (Baja, Bonificación). En Chrome de Windows el menú nativo de un
// select de ~1,800 px salía en blanco y con los nombres cortados a la
// izquierda. Este no depende del menú del sistema: escribís y tocás.
const BuscadorEmpleado = ({ label, empleados, value, onChange }) => {
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(!value);
  const sel = empleados.find(e => e.id === value);
  const norm = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const nq = norm(q).trim();
  const lista = empleados
    .filter(e => !nq || nq.split(/\s+/).every(w => norm(`${e.fullName} ${e.position} ${e.dni} ${e.code || ""}`).includes(w)))
    .sort((a, b) => String(a.fullName).localeCompare(String(b.fullName), "es"));
  const lbl = { fontSize: 12, fontWeight: 600, color: "#475569" };
  if (sel && !abierto) return <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    {label && <label style={lbl}>{label}</label>}
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", border: "1px solid #CBD5E1", borderRadius: 10, background: "#F8FAFC" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#2C2A28" }}>{sel.fullName}</div>
        <div style={{ fontSize: 12, color: "#64748b" }}>{sel.position || "Sin cargo"}{sel.dni ? ` · ${sel.dni}` : ""}</div>
      </div>
      <button type="button" onClick={() => { setAbierto(true); setQ(""); }} style={{ border: "1px solid #DBD4C8", background: "#fff", borderRadius: 999, padding: "6px 14px", fontSize: 12.5, fontWeight: 600, color: "#5C5853", cursor: "pointer" }}>Cambiar</button>
    </div>
  </div>;
  return <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    {label && <label style={lbl}>{label}</label>}
    <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={`Buscá por nombre, cargo o DNI · ${empleados.length} colaboradores`}
      onKeyDown={e => { if (e.key === "Enter" && lista.length === 1) { e.preventDefault(); onChange(lista[0].id); setAbierto(false); } }}
      style={{ padding: "9px 12px", border: "1px solid #CBD5E1", borderRadius: 10, fontSize: 14, background: "#fff", outline: "none" }} />
    <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid #E2E8F0", borderRadius: 10, background: "#fff" }}>
      {lista.length === 0 && <div style={{ padding: 14, fontSize: 13, color: "#94A3B8" }}>Nadie coincide con “{q}”.</div>}
      {lista.map(e => <button type="button" key={e.id} onClick={() => { onChange(e.id); setAbierto(false); }}
        style={{ display: "flex", width: "100%", alignItems: "baseline", gap: 10, padding: "9px 14px", border: "none", borderBottom: "1px solid #F1F5F9", background: e.id === value ? "rgba(232,118,45,.08)" : "transparent", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: "#2C2A28" }}>{e.fullName}</span>
        <span style={{ fontSize: 12, color: "#64748b" }}>{e.position || ""}</span>
      </button>)}
    </div>
  </div>;
};
const Modal = ({ title, onClose, children, wide }) => <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}><div style={{ background: "#fff", borderRadius: 16, padding: 28, width: wide ? "95vw" : 520, maxWidth: "98vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }} onClick={e => e.stopPropagation()}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}><h3 style={{ margin: 0, fontSize: 18 }}>{title}</h3><button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94A3B8" }}>✕</button></div>{children}</div></div>;
const Table = ({ columns, data, actions }) => <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid #E2E8F0" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}><thead><tr style={{ background: "#F1F5F9" }}>{columns.map(c => <th key={c.key} style={{ padding: "10px 14px", textAlign: "left", color: "#475569", fontWeight: 600, borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap" }}>{c.label}</th>)}{actions && <th style={{ padding: "10px 14px", textAlign: "right", borderBottom: "2px solid #E2E8F0" }}>Acciones</th>}</tr></thead><tbody>{data.length === 0 && <tr><td colSpan={columns.length + (actions ? 1 : 0)} style={{ padding: 30, textAlign: "center", color: "#94A3B8" }}>Sin registros</td></tr>}{data.map((r, i) => <tr key={r.id || i} style={{ borderBottom: "1px solid #F1F5F9" }}>{columns.map(c => <td key={c.key} style={{ padding: "10px 14px", color: "#334155" }}>{c.render ? c.render(r) : r[c.key]}</td>)}{actions && <td style={{ padding: "10px 14px", textAlign: "right" }}>{actions(r)}</td>}</tr>)}</tbody></table></div>;
const StatCard = ({ label, value, icon, color = "#0F4C75" }) => <div style={{ background: "#fff", borderRadius: 14, padding: "18px 22px", border: "1px solid #E2E8F0", flex: 1, minWidth: 150 }}><div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ background: color + "15", color, width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{icon}</div><div><div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div><div style={{ fontSize: 12, color: "#64748b" }}>{label}</div></div></div></div>;
const AlertCard = ({ label, value, icon, color }) => <div style={{ background: "#fff", borderRadius: 12, padding: "14px 18px", border: `1px solid ${color}30`, borderLeft: `4px solid ${color}` }}><div style={{ display: "flex", alignItems: "center", gap: 12 }}><div style={{ fontSize: 24 }}>{icon}</div><div><div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div><div style={{ fontSize: 11, color: "#5C5853", marginTop: 2, fontWeight: 600 }}>{label}</div></div></div></div>;

const TH = { padding: "8px 10px", textAlign: "left", color: "#475569", fontWeight: 600, borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap", fontSize: 11 };
// Hojas de asistencia y HE (rediseño 23-oct-2026): encabezados neutros y UNA
// paleta corta para las celdas — verde presente · gris descanso pagado · rojo
// NSP · ámbar incapacidad · azul vacaciones · naranja feriado/domingo trabajado.
const TH_H = { padding: "8px 10px", textAlign: "left", color: "#6E6862", fontWeight: 700, borderBottom: "1px solid rgba(44,42,40,.08)", whiteSpace: "nowrap", fontSize: 11 };
const TD_H = { padding: "6px 10px", color: "#2C2A28", whiteSpace: "nowrap" };
const PAL_CELDA = {
  presente: { bg: "#DCF3E4", fg: "#177243" },
  descanso: { bg: "#F1F0ED", fg: "#8B847C" },
  nsp: { bg: "#F7DEDC", fg: "#B03024" },
  inc: { bg: "#FBEFC4", fg: "#8A5A00" },
  vac: { bg: "#DDE9FA", fg: "#1D5FAF" },
  extra: { bg: "#FBE3D0", fg: "#A94E16" },
  bloq: { bg: "#EEEDEA", fg: "#B5AFA6" },
};
const TD = { padding: "6px 10px", color: "#334155", whiteSpace: "nowrap" };
const INP = { width: 75, padding: "4px 6px", border: "1px solid #E2E8F0", borderRadius: 6, fontSize: 12, textAlign: "right", background: "#F8FAFC" };

// ═══════════════════════════════════════════════════════════════════
// GRÁFICOS SVG (Dashboard gerencial + KPI's, ago 2026)
// ═══════════════════════════════════════════════════════════════════
// Componentes puros a nivel de módulo (sin hooks — seguros contra remount).
// Tooltips nativos vía <title> para interactividad sin estado.
const FONT_DISPLAY = '"Manrope", "Inter", -apple-system, BlinkMacSystemFont, sans-serif';

// Línea/área de presencia diaria. series: [{ label, color, points: [{x, y}] }]
// con y en 0..100 (%) y x = día del mes (1..lastDay). y === null = sin dato.
const GTLineChart = ({ series = [], lastDay = 31, height = 190 }) => {
  const W = 640, H = height, L = 34, R2 = 10, T = 12, B = 24;
  const xOf = d => L + ((d - 1) / Math.max(1, lastDay - 1)) * (W - L - R2);
  const yOf = v => T + (1 - Math.max(0, Math.min(100, v)) / 100) * (H - T - B);
  const ticksX = [1, 5, 10, 15, 20, 25, lastDay].filter((v, i, a) => v <= lastDay && a.indexOf(v) === i);
  return <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
    {[0, 50, 100].map(v => <g key={v}>
      <line x1={L} y1={yOf(v)} x2={W - R2} y2={yOf(v)} stroke="rgba(44,42,40,.07)" strokeWidth="1" />
      <text x={L - 6} y={yOf(v) + 3} textAnchor="end" fontSize="9" fill="#A39C92">{v}%</text>
    </g>)}
    {ticksX.map(d => <text key={d} x={xOf(d)} y={H - 8} textAnchor="middle" fontSize="9" fill="#A39C92">{d}</text>)}
    {series.map((s, si) => {
      const pts = (s.points || []).filter(p => p.y !== null && p.y !== undefined);
      if (!pts.length) return null;
      const poly = pts.map(p => `${xOf(p.x).toFixed(1)},${yOf(p.y).toFixed(1)}`).join(" ");
      const area = `${xOf(pts[0].x).toFixed(1)},${yOf(0).toFixed(1)} ${poly} ${xOf(pts[pts.length - 1].x).toFixed(1)},${yOf(0).toFixed(1)}`;
      return <g key={si}>
        {si === 0 && <polygon points={area} fill={s.color} opacity="0.08" />}
        <polyline points={poly} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map(p => <circle key={p.x} cx={xOf(p.x)} cy={yOf(p.y)} r="3.4" fill="#fff" stroke={s.color} strokeWidth="2">
          <title>{`${s.label} · día ${p.x}: ${p.y}%${p.sub ? ` (${p.sub})` : ""}`}</title>
        </circle>)}
      </g>;
    })}
  </svg>;
};

// Dona simple. segments: [{ value, color, label }]. Tooltips nativos.
const ANIM_GRAF = "2200ms cubic-bezier(.22,1,.36,1)";
const GTDonut = ({ segments = [], size = 132, thickness = 17, centerLabel = "", centerSub = "", progreso = 1 }) => {
  // progreso 0→1 (15-oct-2026): la dona se DIBUJA en barrido al entrar. Cada
  // tajada crece y gira a su lugar con transición CSS (stroke-dasharray +
  // rotate), así al cambiar de mes también se acomoda suave.
  const total = segments.reduce((s, x) => s + (Number(x.value) || 0), 0);
  const RAD = (size - thickness) / 2 - 2, C = size / 2, CIRC = 2 * Math.PI * RAD;
  let acc = 0;
  return <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, display: "block" }}>
    <circle cx={C} cy={C} r={RAD} fill="none" stroke="rgba(44,42,40,.07)" strokeWidth={thickness} />
    {total > 0 && segments.map((s, i) => {
      const v = Math.max(0, Number(s.value) || 0);
      const frac = v / total;
      const rot = (acc / total) * 360 * progreso - 90;
      acc += v;
      return <circle key={s.label || i} cx={C} cy={C} r={RAD} fill="none" stroke={s.color} strokeWidth={thickness}
        strokeLinecap="butt"
        style={{ strokeDasharray: `${(frac * CIRC * progreso).toFixed(2)}px ${CIRC.toFixed(2)}px`, transform: `rotate(${rot}deg)`, transformOrigin: `${C}px ${C}px`, transition: `stroke-dasharray ${ANIM_GRAF}, transform ${ANIM_GRAF}` }}>
        <title>{`${s.label}: ${s.value} (${Math.round(frac * 100)}%)`}</title>
      </circle>;
    })}
    <text x={C} y={C - 1} textAnchor="middle" fontSize="22" fontWeight="800" fill="#2C2A28" style={{ opacity: progreso, transition: `opacity 900ms ease 300ms` }}>{centerLabel}</text>
    <text x={C} y={C + 15} textAnchor="middle" fontSize="8.5" fill="#8B847C" style={{ textTransform: "uppercase", letterSpacing: 1, opacity: progreso, transition: `opacity 900ms ease 300ms` }}>{centerSub}</text>
  </svg>;
};

// Número que CUENTA hacia arriba al aparecer (y al cambiar de valor): de lo
// que mostraba al valor nuevo en ~1.4 s con salida suave. Respeta
// prefers-reduced-motion (salta directo).
const CuentaArriba = ({ valor = 0, formato = (v) => Math.round(v), dur = 2400 }) => {
  const [v, setV] = useState(0);
  const desdeRef = useRef(0);
  useEffect(() => {
    const fin = Number(valor) || 0;
    if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) { desdeRef.current = fin; setV(fin); return; }
    const ini = desdeRef.current, t0 = performance.now();
    let raf;
    const paso = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      const x = ini + (fin - ini) * e;
      desdeRef.current = x; setV(x);
      if (k < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [valor, dur]);
  return <>{formato(v)}</>;
};

// Barras verticales por mes (masa salarial anual estilo IsTeam):
// data: [{ label, value, real }] — real=true pinta dorado (planilla generada),
// false pinta azul (proyección con el roster actual).
const GTMonthBars = ({ data = [], height = 180, fmtVal = v => v, selected = "", onPick = null, progreso = 1 }) => {
  const W = 640, H = height, B = 26, T = 22;
  const max = Math.max(1, ...data.map(d => d.value));
  const bw = (W - 20) / Math.max(1, data.length);
  return <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
    {data.map((d, i) => {
      const h = Math.max(2, (d.value / max) * (H - B - T));
      const x = 10 + i * bw + bw * 0.14, w = bw * 0.72;
      const y = H - B - h;
      const isSel = selected && d.key === selected;
      return <g key={i} style={{ cursor: onPick ? "pointer" : "default", transform: `scaleY(${progreso})`, transformOrigin: `0px ${H - B}px`, transition: `transform ${ANIM_GRAF} ${i * 70}ms` }} onClick={onPick ? () => onPick(d) : undefined}>
        <rect x={x} y={y} width={w} height={h} rx="4"
          fill={d.real ? "#E8762D" : "#CFCAC3"} opacity={d.value ? (isSel ? 1 : 0.9) : 0.25}
          stroke={isSel ? "#2C2A28" : "none"} strokeWidth={isSel ? 1.5 : 0}>
          <title>{`${d.title || d.label}: ${fmtVal(d.value)}${d.real ? " (planilla real)" : " (proyección)"}`}</title>
        </rect>
        {d.value > 0 && <text x={x + w / 2} y={y - 5} textAnchor="middle" fontSize="8.5" fill="#8B847C">{d.top || ""}</text>}
        <text x={x + w / 2} y={H - 10} textAnchor="middle" fontSize="9.5" fontWeight={isSel ? 800 : 400} fill={isSel ? "#2C2A28" : "#8B847C"}>{d.label}</text>
      </g>;
    })}
  </svg>;
};

// Botón de NAVEGACIÓN pura (no muta datos): span clickeable que NO cae bajo
// el <fieldset disabled> de los roles solo-lectura (gerencia/costos) — un
// <button> ahí adentro queda deshabilitado aunque solo cambie la vista
// (mes del dashboard, ‹› de KPI's, Ver firma, Actualizar).
const NavBtn = ({ children, onClick, style: sx }) => (
  <span role="button" onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "1px solid #DBD4C8", background: "#fff", color: "#5C5853", fontSize: 12, fontWeight: 700, cursor: "pointer", userSelect: "none", ...sx }}>{children}</span>
);

// ═══════════════════════════════════════════════════════════════════
// CARNET DEL COLABORADOR (15-oct-2026, rediseño de Empleados)
// ═══════════════════════════════════════════════════════════════════
// Gerson: "las fichas en cajitas de vidrio tipo CARNET bonito de Geo; al dar
// click sale una card a tu pantalla con la parte de atrás del carnet y toda la
// info". A NIVEL DE MÓDULO (definidos adentro se remontarían en cada render).
const CT_LABEL = { permanent: "Permanente", temporary: "Temporal", honorarios: "Honorarios" };
const CT_COLOR = { permanent: CHARCOAL, temporary: ORANGE_DARK, honorarios: "#6E6862" };
// Curvas de nivel del carnet (23-oct-2026, Gerson: "ponele la topografía del
// login"): el mismo ruido + marching squares del fondo del login, pero
// calculado UNA vez y dibujado como un <path> SVG estático (sin canvas, así
// el carnet que viaja/voltea no cuesta nada). Los niveles de abajo van en
// blanco tenue y UNO en naranja, como el resplandor del login.
const curvasDe = (W, H, N, M, seed, niveles, nivelNaranja) => {
  // celdas del muestreo N×M sobre un lienzo W×H
  const perm = (() => { const p = [...Array(256).keys()]; let sd = seed; for (let i = 255; i > 0; i--) { sd = (sd * 16807) % 2147483647; const j = sd % (i + 1); [p[i], p[j]] = [p[j], p[i]]; } const o = new Uint8Array(512); for (let i = 0; i < 512; i++) o[i] = p[i & 255]; return o; })();
  const fade = (t) => t * t * (3 - 2 * t);
  const n2 = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), X = xi & 255, Y = yi & 255, xf = x - xi, yf = y - yi; const h = (a, b) => perm[perm[(X + a) & 255] + ((Y + b) & 255)] / 255; const u = fade(xf), v = fade(yf); return (h(0, 0) * (1 - u) + h(1, 0) * u) * (1 - v) + (h(0, 1) * (1 - u) + h(1, 1) * u) * v; };
  const f = (x, y) => n2(x, y) * .6 + n2(x * 2.1 + 7.3, y * 2.1 + 3.1) * .3 + n2(x * 4.4 + 1.7, y * 4.4 + 9.2) * .1;
  const g = []; for (let j = 0; j <= M; j++) { g[j] = []; for (let i = 0; i <= N; i++) g[j][i] = f(i * 0.11, j * 0.19); }
  const cw = W / N, ch = H / M;
  const nivel = (lv) => {
    let d = "";
    const lerp = (a, b, va, vb) => (lv - va) / (vb - va || 1e-9) * (b - a) + a;
    for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
      const a = g[j][i], b = g[j][i + 1], c = g[j + 1][i + 1], dd = g[j + 1][i];
      const x0 = i * cw, x1 = (i + 1) * cw, y0 = j * ch, y1 = (j + 1) * ch;
      const idx = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (c > lv ? 2 : 0) | (dd > lv ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const T = [lerp(x0, x1, a, b), y0], R = [x1, lerp(y0, y1, b, c)], B = [lerp(x0, x1, dd, c), y1], L = [x0, lerp(y0, y1, a, dd)];
      const seg = { 1: [L, B], 2: [B, R], 3: [L, R], 4: [T, R], 5: [T, L, B, R], 6: [T, B], 7: [T, L], 8: [T, L], 9: [T, B], 10: [T, R, L, B], 11: [T, R], 12: [L, R], 13: [B, R], 14: [L, B] }[idx];
      for (let k = 0; k < seg.length; k += 2) d += `M${seg[k][0].toFixed(1)} ${seg[k][1].toFixed(1)}L${seg[k + 1][0].toFixed(1)} ${seg[k + 1][1].toFixed(1)}`;
    }
    return d;
  };
  return { tenues: niveles.map(nivel).join(""), naranja: nivelNaranja != null ? nivel(nivelNaranja) : "", W, H };
};
const curvasPath = curvasDe(240, 70, 56, 17, 20261023, [.34, .40, .46, .52, .58, .64], .49);
// Cuerpo blanco del carnet: las mismas curvas pero en NARANJA tenue, como el
// resplandor del login (pedido de Gerson, 23-oct).
const curvasCuerpo = curvasDe(240, 200, 60, 50, 20261024, [.30, .36, .42, .48, .54, .60, .66, .72], .51);
const CURVAS_CUERPO = (
  <svg viewBox={`0 0 ${curvasCuerpo.W} ${curvasCuerpo.H}`} preserveAspectRatio="xMidYMid slice" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
    <path d={curvasCuerpo.tenues} fill="none" stroke="rgba(232,118,45,.13)" strokeWidth=".6" strokeLinecap="round" />
    <path d={curvasCuerpo.naranja} fill="none" stroke="rgba(232,118,45,.30)" strokeWidth=".9" strokeLinecap="round" />
  </svg>
);
const CURVAS_CARNET = (
  <svg viewBox={`0 0 ${curvasPath.W} ${curvasPath.H}`} preserveAspectRatio="xMidYMid slice" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
    <path d={curvasPath.tenues} fill="none" stroke="rgba(232,118,45,.32)" strokeWidth=".7" strokeLinecap="round" />
    <path d={curvasPath.naranja} fill="none" stroke="rgba(232,118,45,.9)" strokeWidth="1" strokeLinecap="round" />
  </svg>
);
// Fin de contrato de un temporal: texto + color según los días que faltan.
const finContratoDe = (e) => {
  if (!e?.endDate || e.contractType === "permanent") return null;
  const dias = Math.round((new Date(`${String(e.endDate).slice(0, 10)}T12:00:00`) - new Date(`${hoyISO()}T12:00:00`)) / 86400000);
  const color = dias < 0 ? "#B03024" : dias <= 30 ? ORANGE_DARK : "#6E6862";
  const txt = e.status !== "active" ? `Salió · ${fmt(e.endDate)}` : dias < 0 ? `Venció hace ${-dias} d` : dias === 0 ? "Vence hoy" : `Vence en ${dias} d`;
  return { dias, color, txt };
};

function CarnetFrente({ e, foto, empresa, grande = false }) {
  const activo = e.status === "active";
  const fin = finContratoDe(e);
  const s = grande ? 1.45 : 1;
  return <div style={{ display: "flex", flexDirection: "column", height: "100%", borderRadius: "inherit", overflow: "hidden", position: "relative" }}>
    {CURVAS_CUERPO}
    <div style={{ position: "relative", height: 62 * s, flexShrink: 0, background: "linear-gradient(135deg,#2C2A28 0%,#3A3633 100%)", padding: `${10 * s}px ${14 * s}px`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      {CURVAS_CARNET}
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 7 * s }}>
        <svg width={18 * s} height={18 * s} viewBox="0 0 56 56" aria-hidden><rect width="56" height="56" rx="14" fill="#E8762D" /><path d="M10 34c6-8 12-8 18-3s12 5 18-3" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" /></svg>
        <span style={{ font: `700 ${9 * s}px/1 var(--mono)`, letterSpacing: ".16em", color: "rgba(255,255,255,.85)", textTransform: "uppercase" }}>{empresa}</span>
      </div>
      <span style={{ position: "relative", font: `700 ${9.5 * s}px/1 var(--sans)`, padding: `${4 * s}px ${8 * s}px`, borderRadius: 999, background: "rgba(255,255,255,.14)", color: "#fff" }}>{CT_LABEL[e.contractType] || "—"}</span>
    </div>
    <div style={{ display: "flex", justifyContent: "center", marginTop: -34 * s, position: "relative" }}>
      <div style={{ padding: 3 * s, borderRadius: 22 * s, background: "rgba(255,255,255,.95)", boxShadow: "0 6px 18px rgba(44,42,40,.18)" }}>
        <EmpAvatar name={e.fullName} dataUrl={foto} size={84 * s} borderRadius={19 * s} />
      </div>
    </div>
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: `${10 * s}px ${14 * s}px ${12 * s}px`, gap: 3 * s }}>
      <div style={{ font: `800 ${14.5 * s}px/1.22 var(--display)`, color: CHARCOAL, letterSpacing: "-.01em", wordBreak: "break-word" }}>{e.fullName || "—"}</div>
      <div style={{ font: `500 ${12 * s}px/1.3 var(--sans)`, color: "#6E6862" }}>{e.position || "Sin cargo"}</div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginTop: 10 * s, paddingTop: 9 * s, borderTop: "1px solid rgba(44,42,40,.07)" }}>
        <span style={{ font: `700 ${10.5 * s}px/1 var(--mono)`, color: "var(--naranja-texto-chico)", letterSpacing: ".04em" }}>{genEmpCode(e.fullName, e.dni) || "—"}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, font: `600 ${11 * s}px/1 var(--sans)`, color: fin && fin.dias <= 30 ? fin.color : "#6E6862" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: activo ? "#3E8E5A" : "#B8B1A8" }} />
          {fin ? fin.txt : (e.department || (activo ? "Activo" : "Inactivo"))}
        </span>
      </div>
    </div>
  </div>;
}

// La card que "sale a la pantalla" y se voltea: arranca EXACTAMENTE sobre el
// carnet tocado (rect medido) y viaja al centro girando 180° hasta mostrar el
// dorso. Cerrar hace el camino inverso. Portal a <body>: el vidrio usa
// backdrop-filter y eso volvería "fixed" relativo a la tarjeta.
function CarnetVolteo({ origen, onCerrado, frente, dorso }) {
  const reducir = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [fase, setFase] = useState(reducir || !origen ? "abierto" : "inicio");
  const vw = window.innerWidth, vh = window.innerHeight;
  const W = Math.min(400, vw - 28), H = Math.min(640, vh - 40);
  const left = (vw - W) / 2, top = (vh - H) / 2;
  useEffect(() => {
    if (fase !== "inicio") return;
    let r2; const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setFase("abierto")); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, [fase]);
  const cerrandoRef = useRef(false);
  const cerrar = () => {
    if (cerrandoRef.current) return;
    cerrandoRef.current = true;
    if (reducir || !origen) { onCerrado(); return; }
    setFase("cerrando");
    setTimeout(onCerrado, 900);
  };
  useEffect(() => {
    const k = (ev) => { if (ev.key === "Escape") cerrar(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  const enOrigen = fase !== "abierto" && origen;
  const s = origen ? origen.width / W : 1;
  const tf = enOrigen ? `translate(${origen.left - left}px, ${origen.top + origen.height / 2 - (top + (H * s) / 2)}px) scale(${s})` : "none";
  // Suavidad (15-oct-2026, "al quitarlo se ve laggy"): durante el viaje NADA
  // lleva backdrop-filter (el blur a pantalla completa recalculándose en cada
  // frame era el tirón) — caras con fondo sólido, fondo oscuro sin blur y
  // will-change en lo que se mueve. Abrir desacelera; cerrar es ease-in-out
  // para que "aterrice" sobre su lugar.
  const curva = fase === "cerrando" ? "cubic-bezier(.65,0,.35,1)" : "cubic-bezier(.22,1,.36,1)";
  const durMov = fase === "cerrando" ? 820 : 860, durGiro = fase === "cerrando" ? 780 : 940;
  const cara = { position: "absolute", inset: 0, borderRadius: 26, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", overflow: "hidden", boxShadow: "0 30px 80px rgba(28,26,24,.28), 0 0 0 1px rgba(44,42,40,.07)" };
  return createPortal(<div style={{ position: "fixed", inset: 0, zIndex: 1000 }}>
    <style>{GT_CSS}</style>
    <div onClick={cerrar} style={{ position: "absolute", inset: 0, background: "rgba(28,26,24,.42)", opacity: fase === "abierto" ? 1 : 0, transition: `opacity ${fase === "cerrando" ? 700 : 600}ms ease`, willChange: "opacity" }} />
    <div style={{ position: "absolute", left, top, width: W, height: H, transformOrigin: "top left", transform: tf, transition: reducir ? "none" : `transform ${durMov}ms ${curva}`, perspective: 1800, willChange: "transform" }}>
      <div style={{ position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d", transform: enOrigen ? "rotateY(0deg)" : "rotateY(180deg)", transition: reducir ? "none" : `transform ${durGiro}ms ${curva}`, willChange: "transform" }}>
        <div style={{ ...cara, background: "linear-gradient(165deg,#fff 0%,#FAFAF9 100%)" }}>{frente}</div>
        <div role="dialog" aria-modal="true" style={{ ...cara, transform: "rotateY(180deg)", background: "#fff" }}>{dorso(cerrar)}</div>
      </div>
    </div>
  </div>, document.body);
}

// ── APP ──
// ── ACCESOS AL SISTEMA (2-oct-2026) ─────────────────────────────────────────
// Usuarios creados por Gerson desde GeoTeam → key `gt-usuarios`:
//   {id, username, password, role, label, empId, proyectos:[shorts], activo,
//    createdAt, createdBy, updatedAt, updatedBy}
// El login de App.jsx los acepta después de los fijos de users.js (SOLO con
// getCloud). `label` = nombre de la ficha: es lo que firma en la bitácora.
// `proyectos` es la asignación del RESIDENTE (lo único que ve en GeoSupply).
// A NIVEL DE MÓDULO: dentro del componente se remontaría al tipear.
const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const usernameSugerido = (fullName, tomados) => {
  const partes = sinAcentos(fullName).toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
  if (!partes.length) return "";
  // "Luis Felipe Giron Barahona" → luis.giron (nombre + primer apellido)
  const nombre = partes[0];
  const apellido = partes.length >= 3 ? partes[2] : partes.length === 2 ? partes[1] : "";
  let base = apellido ? `${nombre}.${apellido}` : nombre;
  let u = base, i = 2;
  while (tomados.includes(u)) u = `${base}${i++}`;
  return u;
};
const claveSugerida = () => `geo${Math.floor(1000 + Math.random() * 9000)}`;

function AccesoFormImpl({ acceso, emps, proyectos, tomados, userName, onSave, onClose }) {
  const [f, setF] = useState(acceso || { id: "", empId: "", username: "", password: claveSugerida(), role: "residente", label: "", proyectos: [], activo: true });
  const [verClave, setVerClave] = useState(!acceso);
  const [saving, setSaving] = useState(false);
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const emp = emps.find(e => e.id === f.empId) || null;
  const elegirEmp = (id) => {
    const e = emps.find(x => x.id === id);
    if (!e) { setF(p => ({ ...p, empId: "", label: "" })); return; }
    setF(p => ({ ...p, empId: e.id, label: e.fullName, username: p.username || usernameSugerido(e.fullName, tomados) }));
  };
  const empsOrdenados = [...emps].filter(e => e.status !== "inactive").sort((a, b) => String(a.fullName).localeCompare(String(b.fullName), "es", { sensitivity: "base" }));
  const usernameOk = /^[a-z0-9._-]{3,}$/.test(f.username || "");
  const usernameLibre = !tomados.includes(f.username) || (acceso && acceso.username === f.username);
  const chip = (txt, on, onClick) => <button type="button" key={txt} onClick={onClick} style={{ padding: "7px 12px", borderRadius: 999, border: on ? "none" : "1px solid rgba(44,42,40,.12)", background: on ? ORANGE_DARK : "rgba(255,255,255,.7)", color: on ? "#fff" : "#5C5853", font: "700 12px/1 var(--sans, inherit)", cursor: "pointer" }}>{txt}</button>;
  const CTRL = { padding: "10px 12px", border: "1px solid rgba(44,42,40,.12)", borderRadius: 12, fontSize: 14, outline: "none", background: "#F4F4F2", color: CHARCOAL, fontFamily: "inherit", width: "100%", boxSizing: "border-box" };
  const LBL = { fontSize: 11, fontWeight: 700, color: "#6E6862" };
  const campo = (label, el) => <div style={{ display: "flex", flexDirection: "column", gap: 5 }}><label style={LBL}>{label}</label>{el}</div>;
  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    {campo("Colaborador *", <select style={CTRL} value={f.empId} onChange={e => elegirEmp(e.target.value)} disabled={!!acceso}>
      <option value="">— Elegí de la base de GeoTeam —</option>
      {empsOrdenados.map(e => <option key={e.id} value={e.id}>{e.fullName} — {e.position || "sin cargo"}</option>)}
    </select>)}
    {emp && <div style={{ fontSize: 12, color: "#6E6862", marginTop: -6 }}>{emp.position || "—"} · {emp.department || "—"} · {emp.company === "subterra" ? "Subterra" : "Geotecnica"}</div>}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      {campo("Usuario *", <input style={{ ...CTRL, fontFamily: "var(--mono, monospace)" }} value={f.username} onChange={e => u("username", e.target.value.toLowerCase().trim())} placeholder="nombre.apellido" />)}
      {campo("Clave *", <div style={{ display: "flex", gap: 6 }}>
        <input style={{ ...CTRL, fontFamily: "var(--mono, monospace)" }} type={verClave ? "text" : "password"} value={f.password} onChange={e => u("password", e.target.value)} />
        <button type="button" onClick={() => setVerClave(v => !v)} title={verClave ? "Ocultar" : "Ver"} style={{ ...CTRL, width: 44, padding: 0, cursor: "pointer" }}>{verClave ? "🙈" : "👁"}</button>
      </div>)}
    </div>
    {!usernameOk && f.username && <div style={{ fontSize: 12, color: "#B03024", marginTop: -8 }}>Solo minúsculas, números, punto, guion. Mínimo 3.</div>}
    {usernameOk && !usernameLibre && <div style={{ fontSize: 12, color: "#B03024", marginTop: -8 }}>Ese usuario ya existe.</div>}
    {campo("Rol", <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{ROLES_ASIGNABLES.map(r => chip(ROLE_LABEL[r] || r, f.role === r, () => u("role", r)))}</div>)}
    {f.role === "residente" && <div style={{ fontSize: 12, color: "#6E6862", marginTop: -4 }}>El residente entra SOLO a GeoSupply y Mis Tareas, nunca a GeoShopping. El proyecto lo elige en cada solicitud (se rotan y se cubren entre ellos).</div>}
    {acceso && <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: CHARCOAL, cursor: "pointer" }}>
      <input type="checkbox" checked={f.activo !== false} onChange={e => u("activo", e.target.checked)} /> Acceso activo {f.activo === false && <span style={{ color: "#B03024", fontWeight: 700 }}>(no puede entrar)</span>}
    </label>}
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
      <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Btn>
      <Btn disabled={saving} onClick={async () => {
        if (!f.empId) return alert("Elegí el colaborador.");
        if (!usernameOk) return alert("El usuario no es válido.");
        if (!usernameLibre) return alert("Ese usuario ya existe. Elegí otro.");
        if (String(f.password || "").length < 4) return alert("La clave debe tener al menos 4 caracteres.");
        setSaving(true);
        try {
          const at = new Date().toISOString();
          const rec = { ...f, label: f.label || emp?.fullName || f.username, id: f.id || uid(), updatedAt: at, updatedBy: userName, ...(acceso ? {} : { createdAt: at, createdBy: userName }) };
          const ok = await onSave(rec);
          if (ok) onClose();
        } finally { setSaving(false); }
      }}>{saving ? "Guardando…" : acceso ? "Guardar cambios" : "Crear acceso"}</Btn>
    </div>
  </div>;
}

export default function HRModule({ userRole = "admin", userName, userKey, userEmpId = null, onBack, onLogout, onAbrirModulo }) {
  // Hub de RRHH (20-oct-2026): los roles que NO son de RRHH entran SOLO a su
  // portal "Mi RRHH" (residentes, Fernando, Arturo, visores…). Los de RRHH
  // ven además la bandeja "Solicitudes" y su propio "Mi RRHH" al final.
  const ROLES_RRHH = ["admin", "tesoreria", "asistente", "costos", "recepcion", "asistente_compras", "logistica", "gerencia"];
  const esPortalSolo = !ROLES_RRHH.includes(userRole);
  const [solicitudes, setSolicitudes] = useState([]);
  const [solicitudesErr, setSolicitudesErr] = useState("");
  const [vinculos, setVinculos] = useState({});
  const [hubModal, setHubModal] = useState(null);     // {t:"nueva", tipo} | {t:"ver", id}
  const [solSub, setSolSub] = useState("");           // "" | vacations | leaves | constancias
  // Hub de ASISTENCIA (23-oct-2026): Asistencia · Llegadas tardías · Horas
  // extras (y el acceso a GeoClock) viven en UNA pestaña con cajas de vidrio.
  const [asisSub, setAsisSubRaw] = useState(() => { try { return sessionStorage.getItem("gt-hr-asis") || ""; } catch { return ""; } });
  const setAsisSub = (v) => { setAsisSubRaw(v); try { sessionStorage.setItem("gt-hr-asis", v); } catch { /* sin storage */ } };
  // Solo Gerson (admin) da accesos al sistema.
  const puedeAccesos = userRole === "admin";
  const [accesos, setAccesos] = useState(null);     // null = aún no leído
  const [accesosErr, setAccesosErr] = useState("");
  const isAsistente = userRole === "asistente";
  // Jorge (recepcion) — acceso acotado: SOLO ve la lista de empleados y puede
  // subir/cambiar fotos. No ve planilla, salarios ni ningun otro dato sensible.
  const isPhotoOnly = userRole === "recepcion";
  // Ana (asistente_compras) — acceso acotado de RRHH (pedido de Gerson, ago
  // 2026): ficha COMPLETA de empleados con foto pero SIN salario ni
  // bonificacion, contratos completo, vacaciones, permisos, asistencia,
  // horas extras y constancias. NADA de planilla, movimientos ni costos.
  const isAnaRH = userRole === "asistente_compras";
  // Oscar (logistica, 18-ago-2026): entra a GeoTeam SOLO para el aprobador
  // de Llegadas tardías — es el responsable de decidir las tardanzas que se
  // marcan desde SU tablet (plantel/almacén). Sin montos (hideSalary).
  const isOscarTardies = userRole === "logistica";
  // Quien NO puede ver montos de salario/bonificacion en la ficha.
  const hideSalary = isAnaRH || isPhotoOnly || isOscarTardies;
  const isReadOnly = userRole === "gerencia" || userRole === "costos";
  const [co, setCo] = useState("subterra");
  // La sección se recuerda en la sesión: al volver de GeoClock (abierto desde
  // Asistencia) GeoTeam cae otra vez en Asistencia, no en Mi RRHH.
  const [sec, setSecRaw] = useState(() => { try { return sessionStorage.getItem("gt-hr-sec") || "mi"; } catch { return "mi"; } });
  const setSec = (v) => { setSecRaw(v); try { sessionStorage.setItem("gt-hr-sec", v); } catch { /* sin storage */ } };
  // Accesos (2-oct-2026): se leen SOLO al entrar a la pestaña y SOLO con
  // getCloud (un cache viejo podría revivir un acceso desactivado). Va acá
  // arriba, antes del return de "Cargando…" — un hook después de un return
  // condicional rompe el orden de hooks de React.
  useEffect(() => {
    if (sec !== "accesos" || !puedeAccesos) return;
    let vivo = true;
    (async () => {
      try { const c = await store.getCloud("gt-usuarios"); if (vivo) { setAccesos(Array.isArray(c) ? c : []); setAccesosErr(""); } }
      catch (e) { if (vivo) setAccesosErr("No se pudo leer la nube: " + (e?.message || e)); }
    })();
    return () => { vivo = false; };
  }, [sec, puedeAccesos]);
  const [emps, setEmps] = useState([]);
  const [vacs, setVacs] = useState([]);
  const [lvs, setLvs] = useState([]);
  const [atts, setAtts] = useState([]);
  const [cons, setCons] = useState([]);
  const [pays, setPays] = useState([]);
  const [cuadrillas, setCuadrillas] = useState([]);
  // Proyectos custom creados en GeoShopping (cp-projects). Se leen (solo
  // lectura) para que cuadrillas y asistencia usen la MISMA lista de
  // proyectos que el modulo de compras. GeoShopping es el dueño del dato.
  const [hrCustomProjects, setHrCustomProjects] = useState([]);
  // true cuando la carga de empleados desde la nube vino vacia/fallo —
  // se muestra advertencia en el tab Empleados en vez de sembrar data.
  const [empsLoadWarning, setEmpsLoadWarning] = useState(false);
  // true mientras el boton "Actualizar" del tab Empleados esta re-cargando.
  const [refreshing, setRefreshing] = useState(false);
  // Hoja de asistencia seleccionada en el tab Costos ("" = la mas reciente).
  const [costosSheetId, setCostosSheetId] = useState("");
  // Mes del reporte EJECUTIVO mensual globalizado ("" = el mas reciente).
  const [costosMesEjec, setCostosMesEjec] = useState("");
  // Hojas de horas extras (hr-he): una por empresa+periodo+quincena.
  // { id, company, periodo, quincena, assignments, hours: { "empId-dia":
  //   { b1, b2, b3 } }, lastSaved } — b1=4-7pm(+25%), b2=7-10pm(+50%),
  //   b3=10pm-12am(+75%); domingo todas las bandas ×2 (+100%).
  const [hes, setHes] = useState([]);
  // Ajuste de salario base para HORAS EXTRAS (casos especiales: p.ej. a Edgar
  // Izcano y Osue Pineda su HE se paga sobre salario minimo, no su salario
  // real). Mapa global {empId: salarioBaseHE}. Si un empId no esta aca, se
  // usa su salario real. Aplica a TODAS las quincenas (arreglo permanente).
  const [heSalBase, setHeSalBase] = useState({});
  // RESPALDO VIVO de la grid de HE contra remounts. HorasExtrasGrid se define
  // dentro de HRModule, asi que CUALQUIER re-render del padre (ej: fotos de
  // empleados que terminan de cargar en segundo plano) la desmonta y remonta,
  // reseteando lo digitado — asi se perdieron las HE de Geotecnica el
  // 29-jul-2026 (se guardo la hoja vacia sin error). La grid espeja aca su
  // estado en cada cambio y, si remonta, lo restaura. Key por
  // company|periodo|quincena. Se limpia al guardar OK o al Cerrar explicito.
  const heDraftRef = useRef(null);
  // Mismo respaldo anti-remount para la grid de ASISTENCIA (30-jul-2026 se
  // perdio la asistencia de Subterra por la misma clase de bug que las HE).
  const attDraftRef = useRef(null);
  // ── GeoClock (ago 2026) ──
  // Marcajes del reloj por quincena: { "<periodo>|<quincena>": [marks] }.
  // Se cargan la quincena actual y la anterior en loadAll, y se refrescan
  // al abrir una hoja de asistencia (openGrid) para que initialData siembre
  // los "1" de los marcajes. GeoClock es el UNICO que escribe esas keys.
  const [gcMarks, setGcMarks] = useState({});
  // Decisiones de RRHH sobre llegadas tarde (gc-tardies): [{ markId, estado:
  // "aprobada"|"denegada", decididoPor, decididoAt, nota }]. Una marca tarde
  // SIN decision esta "pendiente". RRHH es el UNICO que escribe esta key.
  const [gcTardies, setGcTardies] = useState([]);
  // Mes seleccionado en la pestaña KPI's ("" = mes actual).
  const [kpisMes, setKpisMes] = useState("");
  // Meses seleccionados en el Dashboard gerencial ([] = solo el mes actual).
  const [dashMeses, setDashMeses] = useState([]);
  // Animación de entrada de los gráficos (15-oct-2026): 0 al entrar a
  // Dashboard/KPI's (o cambiar de empresa) y 1 dos frames después, así las
  // donas, barras y cifras "cargan" despacio.
  const [grafAnim, setGrafAnim] = useState(0);
  const [movs, setMovs] = useState([]);
  const [movsFilter, setMovsFilter] = useState({ periodo: "", quincena: "" });
  const [contracts, setContracts] = useState([]);
  const [bonifs, setBonifs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  // Search de Control de Contratos — al nivel del padre para que el input
  // no pierda foco cuando HRModule re-renderiza (era bug en el subcomponente
  // anterior que se remontaba en cada render).
  const [contractSearch, setContractSearch] = useState("");
  const [ctFiltro, setCtFiltro] = useState(""); // vencidos | pronto | vigentes | sin
  const [ctAbiertos, setCtAbiertos] = useState({}); // {empId: true} filas desplegadas
  // Filtros del tab Empleados — al nivel del padre para no perder foco en el
  // input de busqueda cuando el modulo re-renderiza.
  const [empSearch, setEmpSearch] = useState("");
  const [empDeptFilter, setEmpDeptFilter] = useState("");
  // Cache de fotos de empleados: { fileId: dataUrl }. Cargamos las fotos
  // en cloud (cp-file-<id>) despues del render inicial, para no bloquear el
  // primer paint del tab.
  const [photoCache, setPhotoCache] = useState({});
  const [empTipo, setEmpTipo] = useState("todos");
  const [carnet, setCarnet] = useState(null); // {id, rect} del carnet abierto
  // Planilla (16-oct-2026)
  const [payVista, setPayVista] = useState("lista");   // lista | editor
  const [payDraft, setPayDraft] = useState(null);      // planilla en edición
  const [payAbiertos, setPayAbiertos] = useState({});
  const [payBusy, setPayBusy] = useState(false);
  const [payQ, setPayQ] = useState("");
  const [payGrupo, setPayGrupo] = useState("todos");
  const [payNuevo, setPayNuevo] = useState(null);      // mini-form de ingreso/deducción extra
  const [payPer, setPayPer] = useState("");
  const [payQui, setPayQui] = useState("");
  const [payParte, setPayParte] = useState("salarios"); // salarios | he — la planilla de HE va APARTE (20-oct-2026)
  // Firmas de marcajes GeoClock cargadas on-demand en Llegadas tardías:
  // { markId: dataUrl }. Se cargan solo al tocar "Ver firma".
  const [firmaCache, setFirmaCache] = useState({});
  // Filtros de la pestaña Llegadas tardías (18-ago-2026).
  const [tardEstado, setTardEstado] = useState("");   // "" | pendientes | aprobadas | denegadas
  const [tardPersona, setTardPersona] = useState(""); // empId | ""
  const [tardResp, setTardResp] = useState("");       // "" | Oscar Paz | Ana Vasquez | supers
  // Archivo por mes / fecha exacta: "" = recientes (quincena actual + la
  // anterior). Elegir un mes o una fecha carga esas quincenas de la nube.
  const [tardMes, setTardMes] = useState("");         // "" | "YYYY-MM"
  const [tardFecha, setTardFecha] = useState("");     // "" | "YYYY-MM-DD"
  const [modal, setModal] = useState(null);
  const isMobile = useIsMobile();

  // Carga TODO desde la base de datos (nube + cache local). Reutilizable:
  // corre al montar el modulo y desde el boton "Actualizar" del tab
  // Empleados, para que la lista quede siempre amarrada a lo que hay en la
  // nube (ambas empresas viven en la misma key hr-emps5; el toggle de
  // empresa filtra en memoria).
  const loadAll = async () => {
    const [e, v, l, a, c, p, cq2, mv, ct, bn, cpProj, he0, hsb] = await Promise.all([
      store.get("hr-emps5"), store.get("hr-vacs"), store.get("hr-lvs"),
      store.get("hr-atts2"), store.get("hr-cons"), store.get("hr-pays"), store.get("hr-cuad"),
      store.get("hr-movs"), store.get("hr-contracts"), store.get("hr-bonuses"),
      store.get("cp-projects"), store.get("hr-he"), store.get("hr-he-salbase"),
    ]);
    if (Array.isArray(e) && e.length > 0) {
      setEmps(e);
      setEmpsLoadWarning(false);
    } else {
      // La base de datos es la UNICA fuente de verdad para empleados.
      // OJO: aqui antes se re-sembraba una lista hardcodeada (abril 2026) y
      // se SUBIA a la nube — si la lectura fallaba por red, eso PISABA la
      // base real (fotos, salarios, altas/bajas). Eliminado. Si no cargo
      // nada, se muestra advertencia y se reintenta con "Actualizar" —
      // nunca se escribe nada automaticamente.
      setEmpsLoadWarning(true);
    }
    if (v) setVacs(v); if (l) setLvs(l); if (a) setAtts(a); if (c) setCons(c); if (p) setPays(p); if (cq2) setCuadrillas(cq2); if (mv) setMovs(mv); if (ct) setContracts(ct); if (bn) setBonifs(bn);
    if (Array.isArray(he0)) setHes(he0);
    if (hsb && typeof hsb === "object" && !Array.isArray(hsb)) setHeSalBase(hsb);
    if (Array.isArray(cpProj)) setHrCustomProjects(cpProj);
    setLoaded(true);
    // Hub de RRHH: la bandeja SOLO con getCloud (un cache viejo podría
    // revivir una solicitud ya decidida). Si la nube no responde se avisa.
    try {
      const [sol, vin] = await Promise.all([store.getCloud(KEY_SOLICITUDES), store.getCloud(KEY_VINCULOS)]);
      setSolicitudes(Array.isArray(sol) ? sol : []); setSolicitudesErr("");
      if (vin && typeof vin === "object" && !Array.isArray(vin)) setVinculos(vin);
    } catch (e) { setSolicitudesErr("No se pudieron leer las solicitudes de la nube: " + (e?.message || e)); }
    // GeoClock: marcajes de la quincena actual + la anterior, y decisiones
    // de tardanzas. Aparte del Promise.all principal para que un fallo aca
    // nunca bloquee la carga del modulo.
    try {
      const q0 = getQuincena(hoyTegus());
      const q1 = quincenaAnterior(q0.periodo, q0.quincena);
      const [td, m0, m1] = await Promise.all([
        store.get("gc-tardies"),
        store.get(gcMarkKey(q0.periodo, q0.quincena)),
        store.get(gcMarkKey(q1.periodo, q1.quincena)),
      ]);
      if (Array.isArray(td)) setGcTardies(td);
      setGcMarks(prev => ({
        ...prev,
        [`${q0.periodo}|${q0.quincena}`]: Array.isArray(m0) ? m0 : [],
        [`${q1.periodo}|${q1.quincena}`]: Array.isArray(m1) ? m1 : [],
      }));
    } catch { /* GeoClock es opcional para el resto del modulo */ }
  };
  useEffect(() => { loadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Bulk load de fotos de empleados desde cloud una vez cargada la lista.
  // Corre solo para los fileIds que aun no estan en el cache — asi al subir
  // una foto nueva (que ya guardamos en el cache) no reintenta cargarla.
  useEffect(() => {
    if (!emps.length) return;
    const missing = [];
    const seen = new Set();
    for (const e of emps) {
      const fid = e.photo?.fileId;
      if (fid && !photoCache[fid] && !seen.has(fid)) {
        seen.add(fid);
        missing.push(fid);
      }
    }
    if (!missing.length) return;
    (async () => {
      const results = await Promise.all(missing.map(async (fid) => {
        try {
          const full = await store.get(`cp-file-${fid}`);
          return [fid, full?.dataUrl || null];
        } catch { return [fid, null]; }
      }));
      setPhotoCache(prev => {
        const next = { ...prev };
        let changed = false;
        for (const [fid, url] of results) if (url) { next[fid] = url; changed = true; }
        return changed ? next : prev;
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emps]);

  // Setters con persistencia. Son async y retornan el resultado real de
  // store.set (true = sincronizado a la nube, false = solo quedo local).
  // Los callers criticos (cuadrilla, asistencia) hacen await para avisar
  // al usuario si la nube fallo; el resto puede seguir fire-and-forget.
  const sE = async d => { setEmps(d); return await store.set("hr-emps5", d); };
  const sV = async d => { setVacs(d); return await store.set("hr-vacs", d); };
  const sL = async d => { setLvs(d); return await store.set("hr-lvs", d); };
  const sA = async d => { setAtts(d); return await store.set("hr-atts2", d); };
  const sC = async d => { setCons(d); return await store.set("hr-cons", d); };
  const sP = async d => { setPays(d); return await store.set("hr-pays", d); };
  // hr-cuad: MERGE por unidad (company|periodo|quincena) contra la NUBE.
  // Antes era un write full-array desde el state local — y así desapareció la
  // cuadrilla de Subterra 1Q 2026-08 el 14-ago: al guardar la de Geotecnica
  // 9 segundos después, el array subido no traía la de Subterra. Mismo
  // patrón que ya protege la asistencia y las HE.
  const sCq = async (d, opts = {}) => {
    const keyOf = c => `${c.company}|${c.periodo}|${c.quincena}`;
    let cloudArr = null;
    try { const c = await store.getCloud("hr-cuad"); if (Array.isArray(c)) cloudArr = c; } catch { cloudArr = null; }
    let next = d;
    if (cloudArr) {
      // Lo que estaba en memoria y ya no está en `d` = borrado intencional.
      const prevIds = new Set((cuadrillas || []).map(c => c && c.id).filter(Boolean));
      const nextIds = new Set(d.map(c => c && c.id).filter(Boolean));
      const borrados = new Set([...prevIds].filter(id => !nextIds.has(id)));
      const nextKeys = new Set(d.map(keyOf));
      const rescatadas = cloudArr.filter(c => c && c.id && !borrados.has(c.id) && !nextKeys.has(keyOf(c)));
      if (rescatadas.length) {
        console.warn(`[sCq] rescatadas ${rescatadas.length} cuadrilla(s) de la nube que no estaban en memoria:`, rescatadas.map(keyOf));
        next = [...d, ...rescatadas];
      }
      // Guardia anti-borrado masivo (los borrados legítimos son de a una).
      if (borrados.size > 1 && !opts.permitirBorradoMultiple) {
        if (!confirm(`⚠️ Este guardado ELIMINARÍA ${borrados.size} distribuciones de cuadrilla.\n\n¿Es intencional? Si no borraste nada, tocá Cancelar y recargá la página.`)) return false;
      }
    }
    setCuadrillas(next);
    const ok = await store.set("hr-cuad", next);
    if (!ok) return false;
    // VERIFY contra la nube: las cuadrillas de `next` deben estar todas.
    try {
      const back = await store.getCloud("hr-cuad");
      if (Array.isArray(back)) {
        const backKeys = new Set(back.map(keyOf));
        const faltan = next.filter(c => !backKeys.has(keyOf(c)));
        if (faltan.length) { console.error("[sCq] verify falló, faltan:", faltan.map(keyOf)); return false; }
      }
    } catch { /* sin nube no se puede verificar; store.set ya dijo OK */ }
    return true;
  };
  const sM = async d => { setMovs(d); return await store.set("hr-movs", d); };

  // ═══════════════════════════════════════════════════════════════════
  // VACACIONES / PERMISOS → ASISTENCIA (automático, ago 2026)
  // ═══════════════════════════════════════════════════════════════════
  // Pedido de Gerson: al registrar vacaciones (o un permiso) las celdas se
  // marcan SOLAS en la hoja de asistencia de la quincena que corresponda.
  // Reglas que respeta (las mismas del marcado a mano):
  //   • Domingos y feriados NO se tocan: ya valen "1" (descanso pagado) y su
  //     ciclo de celda no ofrece "V" — marcarlos rompería los cálculos.
  //   • Días BLOQUEADOS por alta/baja se saltan (precedente Norman 30-jul).
  //   • Solo pisa celdas vacías o con el valor que este mismo mecanismo pone;
  //     nunca sobreescribe un 0/INC/DT que alguien marcó a mano.
  //   • Al borrar/rechazar el registro, LIMPIA lo que había puesto.
  //   • Si la hoja de esa quincena todavía no existe, no pasa nada: al
  //     crearla, initialData siembra las vacaciones aprobadas (ver abajo).
  // Guardado con merge por hoja contra getCloud + verify, igual que el botón
  // "Guardar asistencia" — nunca con el sA plano.
  const rangoDeFechas = (desde, hasta) => {
    const out = [];
    const a = String(desde || "").slice(0, 10), b = String(hasta || desde || "").slice(0, 10);
    if (!a) return out;
    const [y1, m1, d1] = a.split("-").map(Number);
    const [y2, m2, d2] = (b || a).split("-").map(Number);
    if (!y1 || !m1 || !d1) return out;
    let cur = new Date(y1, m1 - 1, d1);
    const fin = (y2 && m2 && d2) ? new Date(y2, m2 - 1, d2) : cur;
    let guard = 0;
    while (cur <= fin && guard++ < 400) {
      out.push({ y: cur.getFullYear(), m: cur.getMonth() + 1, day: cur.getDate(), dow: cur.getDay() });
      cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
    }
    return out;
  };
  // Escribe (o limpia) las celdas de un registro en las hojas de asistencia.
  // valor: "V" (vacaciones) | "1" (permiso con goce) | "0" (permiso sin goce)
  // modo: "aplicar" | "limpiar"
  const marcarEnAsistencia = async (empId, desde, hasta, valor, modo = "aplicar") => {
    const emp = (emps || []).find(e => e.id === empId);
    if (!emp || !empId) return { ok: true, celdas: 0, hojas: [] };
    const dias = rangoDeFechas(desde, hasta);
    if (!dias.length) return { ok: true, celdas: 0, hojas: [] };

    // La nube MANDA: si no responde, NO se escribe hr-atts2 (escribir el
    // array completo desde memoria podría pisar hojas de la otra empresa o
    // de otra quincena — así se perdió Subterra el 30-jul).
    let cloudArr = null;
    try { const c = await store.getCloud("hr-atts2"); if (Array.isArray(c)) cloudArr = c; } catch { cloudArr = null; }
    if (!cloudArr) return { ok: false, celdas: 0, hojas: [], sinNube: true };
    const keyOf = a => `${a.company}|${a.periodo}|${a.quincena}`;
    const byKey = {};
    [...(Array.isArray(atts) ? atts : []), ...(cloudArr || [])].forEach(a => {
      if (!a || !a.id) return;
      const kk = keyOf(a);
      const cur = byKey[kk];
      if (!cur || String(a.lastSaved || a.date || "") > String(cur.lastSaved || cur.date || "")) byKey[kk] = a;
    });

    let celdas = 0;
    const hojasTocadas = new Set();
    dias.forEach(({ y, m, day, dow }) => {
      const periodo = `${y}-${String(m).padStart(2, "0")}`;
      const quincena = day <= 15 ? "1Q" : "2Q";
      const hoja = byKey[`${emp.company}|${periodo}|${quincena}`];
      if (!hoja) return;                      // sin hoja de esa quincena: nada
      if (dow === 0) return;                  // domingo: queda "1"
      if (esFeriadoQuincena(periodo, day)) return; // feriado: queda "1"
      // Bloqueo por alta/baja (mismas reglas que dayLockReason)
      const dStr = `${periodo}-${String(day).padStart(2, "0")}`;
      if (emp.startDate && dStr < emp.startDate) return;
      if (fueraPorBaja(emp, dStr)) return;
      const k = `${empId}-${day}`;
      const grid = { ...(hoja.grid || {}) };
      const actual = grid[k] || "";
      if (modo === "limpiar") {
        if (actual !== valor) return;         // lo cambiaron a mano: respetar
        // Vuelve a "1": el día sigue siendo laborable y así no queda un hueco
        // que baje el conteo de días pagados sin que nadie se dé cuenta.
        grid[k] = "1";
      } else {
        if (actual === valor) return;         // ya estaba: idempotente
        // Las vacaciones/permisos GANAN sobre vacío y sobre "1" (presencia
        // genérica / autorrelleno), porque son el dato más específico. Pero
        // NUNCA pisan una marca deliberada que diga otra cosa: 0 (no se
        // presentó), INC (incapacidad) ni DT/DT2/TF (sí trabajó).
        if (actual !== "" && actual !== "1") return;
        grid[k] = valor;
      }
      byKey[keyOf(hoja)] = { ...hoja, grid, lastSaved: new Date().toISOString() };
      hojasTocadas.add(`${quincena} ${periodo}`);
      celdas++;
    });
    if (!celdas) return { ok: true, celdas: 0, hojas: [] };

    const updated = Object.values(byKey);
    setAtts(updated);
    let ok = await store.set("hr-atts2", updated);
    // VERIFY con lectura directa: las celdas deben estar en la nube (mismo
    // contrato que el botón "Guardar asistencia").
    if (ok) {
      try {
        const back = await store.getCloud("hr-atts2");
        if (Array.isArray(back)) {
          const falla = [...hojasTocadas].some(h => {
            const [q, per] = h.split(" ");
            const hoja = back.find(a => a.company === emp.company && a.periodo === per && a.quincena === q);
            return !hoja;
          });
          if (falla) ok = false;
        }
      } catch { /* sin nube no se puede verificar; store.set ya dijo OK */ }
    }
    return { ok, celdas, hojas: [...hojasTocadas] };
  };
  // Traduce un registro de vacaciones/permiso al valor de celda que le toca.
  const valorVac = () => "V";
  const valorPermiso = (lv) => (String(lv?.type || "").toLowerCase().includes("sin goce") ? "0" : "1");
  // Sincroniza un registro: aplica si cuenta, limpia si fue rechazado/borrado.
  const syncVacacion = async (nuevo, viejo) => {
    const msgs = [];
    if (viejo) {
      const r = await marcarEnAsistencia(viejo.employeeId, viejo.startDate, viejo.endDate, "V", "limpiar");
      if (r.celdas) msgs.push(`− ${r.celdas} día(s) desmarcado(s) del registro anterior`);
      if (r.sinNube) msgs.push("⚠️ Sin conexión: los días del registro anterior NO se desmarcaron en la asistencia — revisala a mano.");
      else if (!r.ok) msgs.push("⚠️ Los días del registro anterior NO se pudieron desmarcar en la nube — revisá la asistencia.");
    }
    if (nuevo && nuevo.status !== "rejected") {
      const r = await marcarEnAsistencia(nuevo.employeeId, nuevo.startDate, nuevo.endDate, "V", "aplicar");
      if (r.sinNube) msgs.push("⚠️ Sin conexión con la nube: las vacaciones quedaron registradas pero NO se marcaron en la asistencia. Volvé a guardar este registro cuando tengas señal.");
      else if (r.celdas) msgs.push(`✅ ${r.celdas} día(s) marcados como VACACIONES en la asistencia (${r.hojas.join(", ")})`);
      else msgs.push("ℹ️ No se marcó nada en la asistencia: la hoja de esa quincena todavía no existe, o los días son domingos/feriados. Al crear la hoja se siembran solas.");
      if (!r.ok && !r.sinNube) msgs.push("⚠️ La asistencia NO se sincronizó a la nube — revisá tu conexión.");
    }
    if (msgs.length) alert(msgs.join("\n"));
  };
  const syncPermiso = async (nuevo, viejo) => {
    const msgs = [];
    if (viejo) {
      const r = await marcarEnAsistencia(viejo.employeeId, viejo.date, viejo.date, valorPermiso(viejo), "limpiar");
      if (r.celdas) msgs.push(`− ${r.celdas} día(s) desmarcado(s) del permiso anterior`);
      if (r.sinNube || !r.ok) msgs.push("⚠️ El día del permiso anterior NO se desmarcó en la asistencia — revisala a mano.");
    }
    if (nuevo && nuevo.status !== "rejected") {
      const v = valorPermiso(nuevo);
      const r = await marcarEnAsistencia(nuevo.employeeId, nuevo.date, nuevo.date, v, "aplicar");
      if (r.sinNube) msgs.push("⚠️ Sin conexión con la nube: el permiso quedó registrado pero NO se marcó en la asistencia. Volvé a guardarlo cuando tengas señal.");
      else if (r.celdas) msgs.push(`✅ Permiso marcado en la asistencia como "${v === "0" ? "0 (sin goce, no se paga)" : "1 (día pagado)"}" en ${r.hojas.join(", ")}`);
      else msgs.push("ℹ️ No se marcó en la asistencia: la hoja de esa quincena no existe todavía, o el día es domingo/feriado.");
      if (!r.ok && !r.sinNube) msgs.push("⚠️ La asistencia NO se sincronizó a la nube — revisá tu conexión.");
    }
    if (msgs.length) alert(msgs.join("\n"));
  };
  // ═══════════════════════════════════════════════════════════════════
  // LLEGADAS TARDÍAS GeoClock → ASISTENCIA (ago 2026)
  // ═══════════════════════════════════════════════════════════════════
  // Cuando RRHH DENIEGA la explicación de una llegada tarde, la hora real
  // de llegada se fija en arrivalTimes de la hoja de esa quincena — el
  // mismo mecanismo de pago proporcional de José Miguel: cada hora tarde
  // (contada desde la hora de entrada del HORARIO del empleado) resta 1/8
  // del día en planilla y en Costos MO. Merge por hoja contra getCloud +
  // verify; si la nube no responde, ABORTA sin escribir (regla de oro).
  const marcarTardanzaEnAsistencia = async (empId, fecha, hora, modo = "aplicar") => {
    const emp = (emps || []).find(e => e.id === empId);
    const dStr = String(fecha || "").slice(0, 10);
    if (!emp || !dStr || !hora) return { ok: true, celdas: 0 };
    const [y, m, day] = dStr.split("-").map(Number);
    if (!y || !m || !day) return { ok: true, celdas: 0 };
    const periodo = `${y}-${String(m).padStart(2, "0")}`;
    const quincena = day <= 15 ? "1Q" : "2Q";
    // Domingos/feriados se pagan por ley — no aplica descuento por hora.
    if (new Date(y, m - 1, day).getDay() === 0 || esFeriadoQuincena(periodo, day)) return { ok: true, celdas: 0 };
    if (emp.startDate && dStr < emp.startDate) return { ok: true, celdas: 0 };
    if (fueraPorBaja(emp, dStr)) return { ok: true, celdas: 0 };
    let cloudArr = null;
    try { const c = await store.getCloud("hr-atts2"); if (Array.isArray(c)) cloudArr = c; } catch { cloudArr = null; }
    if (!cloudArr) return { ok: false, celdas: 0, sinNube: true };
    const keyOf = a => `${a.company}|${a.periodo}|${a.quincena}`;
    const byKey = {};
    [...(Array.isArray(atts) ? atts : []), ...cloudArr].forEach(a => {
      if (!a || !a.id) return;
      const kk = keyOf(a);
      const cur = byKey[kk];
      if (!cur || String(a.lastSaved || a.date || "") > String(cur.lastSaved || cur.date || "")) byKey[kk] = a;
    });
    const hoja = byKey[`${emp.company}|${periodo}|${quincena}`];
    // Sin hoja todavía: no pasa nada — initialData siembra la hora al crearla.
    if (!hoja) return { ok: true, celdas: 0, sinHoja: true };
    const k = `${empId}-${day}`;
    const at = { ...(hoja.arrivalTimes || {}) };
    const grid = { ...(hoja.grid || {}) };
    if (modo === "limpiar") {
      if (at[k] !== hora) return { ok: true, celdas: 0 }; // la cambiaron a mano: respetar
      delete at[k];
    } else {
      if (at[k] === hora) return { ok: true, celdas: 1, hoja: `${quincena} ${periodo}` }; // idempotente
      at[k] = hora;
      // El día SÍ se trabajó (lo dice el marcaje): si la celda está vacía,
      // se marca "1". Nunca pisa 0/INC/V/DT — eso lo decide RRHH a mano.
      if (!grid[k]) grid[k] = "1";
    }
    byKey[`${emp.company}|${periodo}|${quincena}`] = { ...hoja, grid, arrivalTimes: at, lastSaved: new Date().toISOString() };
    const updated = Object.values(byKey);
    setAtts(updated);
    let ok = await store.set("hr-atts2", updated);
    if (ok) {
      try {
        const back = await store.getCloud("hr-atts2");
        const mine = Array.isArray(back) ? back.find(a => a.company === emp.company && a.periodo === periodo && a.quincena === quincena) : null;
        if (!mine) ok = false;
        else if (modo !== "limpiar" && (mine.arrivalTimes || {})[k] !== hora) ok = false;
        else if (modo === "limpiar" && (mine.arrivalTimes || {})[k] === hora) ok = false;
      } catch { /* sin nube no se puede verificar; store.set ya dijo OK */ }
    }
    return { ok, celdas: 1, hoja: `${quincena} ${periodo}` };
  };
  // Decisiones de tardanzas (gc-tardies): SIEMPRE un delta de UNA decisión
  // ({ upsert: decision } o { remove: markId }) aplicado sobre la nube
  // FRESCA. Antes recibía el array completo del estado local — una pestaña
  // desactualizada podía pisar o revivir decisiones tomadas por otro usuario.
  const sGcTardies = async (op) => {
    let cloudArr;
    try { const c = await store.getCloud("gc-tardies"); cloudArr = Array.isArray(c) ? c : []; }
    catch {
      alert("⚠️ No hay conexión con la nube — la decisión NO se guardó. Reintentá cuando tengas señal.");
      return false;
    }
    const byId = {};
    cloudArr.forEach(t => { if (t && t.markId) byId[t.markId] = t; });
    if (op.remove) delete byId[op.remove];
    if (op.upsert && op.upsert.markId) byId[op.upsert.markId] = op.upsert;
    const next = Object.values(byId);
    setGcTardies(next);
    const ok = await store.set("gc-tardies", next);
    if (!ok) return false;
    try {
      const back = await store.getCloud("gc-tardies");
      if (Array.isArray(back)) {
        if (op.upsert && !back.some(t => t && t.markId === op.upsert.markId && t.estado === op.upsert.estado)) return false;
        if (op.remove && back.some(t => t && t.markId === op.remove)) return false;
      }
    } catch { /* sin nube no se puede verificar; store.set ya dijo OK */ }
    return true;
  };
  // Refresca los marcajes GeoClock de una quincena (para abrir asistencia o
  // actualizar el reporte de tardanzas con lo último del reloj). Lee DIRECTO
  // de la nube (getCloud): la siembra de la hoja afecta dinero — cache viejo
  // no sirve. Si la nube no responde, se queda con lo que había en memoria.
  const refreshMarksFor = async (periodo, quincena) => {
    try {
      const mk = await store.getCloud(gcMarkKey(periodo, quincena));
      setGcMarks(prev => ({ ...prev, [`${periodo}|${quincena}`]: Array.isArray(mk) ? mk : [] }));
      return Array.isArray(mk) ? mk : [];
    } catch { return gcMarks[`${periodo}|${quincena}`] || []; }
  };
  // Refresca también las DECISIONES (gc-tardies): las horas de denegadas se
  // siembran en initialArrivals al abrir la hoja — deben venir de la nube.
  const refreshTardies = async () => {
    try {
      const td = await store.getCloud("gc-tardies");
      if (Array.isArray(td)) { setGcTardies(td); return td; }
    } catch { /* se queda con lo local */ }
    return gcTardies;
  };
  // ARCHIVO de tardanzas: al elegir un mes o fecha exacta en los filtros de
  // Llegadas tardías, se cargan de la nube las quincenas de ese mes (por
  // default solo viven en memoria la actual y la anterior).
  useEffect(() => {
    const per = tardFecha ? String(tardFecha).slice(0, 7) : tardMes;
    if (!per) return;
    (async () => {
      await Promise.all([refreshMarksFor(per, "1Q"), refreshMarksFor(per, "2Q"), refreshTardies()]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tardMes, tardFecha]);
  const sCt = async d => { setContracts(d); return await store.set("hr-contracts", d); };
  const sBn = async d => { setBonifs(d); return await store.set("hr-bonuses", d); };
  const sHe = async d => { setHes(d); return await store.set("hr-he", d); };
  const sHeSalBase = async d => { setHeSalBase(d); return await store.set("hr-he-salbase", d); };

  // ── Proyectos sincronizados con GeoShopping ──
  // Lista unificada: base (projects.js) + custom de compras (cp-projects),
  // respetando overrides (hidden/deleted) — misma logica que PurchasesModule.
  const hrProjects = (() => {
    const baseShorts = new Set(PROJECTS.map(p => p.short));
    const out = [];
    PROJECTS.forEach(p => {
      const extra = hrCustomProjects.find(cp => cp.short === p.short);
      if (extra?.hidden || extra?.deleted) return;
      out.push({ ...p, ...(extra || {}), isCustom: false });
    });
    hrCustomProjects.forEach(cp => {
      if (baseShorts.has(cp.short) || cp.hidden || cp.deleted) return;
      out.push({ ...cp, isCustom: true });
    });
    return out;
  })();
  // Busca en la lista unificada (short, id o alias). Reemplaza a findProject
  // (que solo conoce la lista base) en chequeos de asignaciones.
  const findProjectHR = (k) => {
    if (!k) return null;
    const s = String(k).trim();
    return hrProjects.find(p => p.short === s)
      || hrProjects.find(p => p.id === s)
      || hrProjects.find(p => (p.aliases || []).includes(s))
      || null;
  };
  // Version HR de resolveShort: GeoShopping es la fuente de verdad. Si el
  // short existe como proyecto REAL en la lista unificada, NO se remapea por
  // alias legacy. Caso concreto que rompia: "PLANTEL" es proyecto de compras
  // Y alias viejo de PLANTEL-OFICINA — resolveShort lo remapeaba y la gente
  // asignada a PLANTEL "desaparecia" de su tarjeta y caia en PLANTEL-OFICINA.
  // Solo shorts que NO existen como proyecto se resuelven como alias viejo.
  const resolveShortHR = (s) => {
    if (!s) return s;
    if (hrProjects.some(p => p.short === s)) return s;
    return resolveShort(s);
  };

  const ce = emps.filter(e => e.company === co);
  // Politica: todo empleado en la base de datos de la empresa se considera activo.
  // No filtramos por status — si esta en `ce`, debe aparecer en cuadrilla, asistencia,
  // planilla y demas vistas operativas.
  const ae = ce;
  const cv = vacs.filter(v => ce.some(e => e.id === v.employeeId));
  const cl = lvs.filter(l => ce.some(e => e.id === l.employeeId));
  const ca = atts.filter(a => a.company === co);
  const cq = cuadrillas.filter(q => q.company === co);
  const che = hes.filter(h => h.company === co);
  const cc2 = cons.filter(c => ce.some(e => e.id === c.employeeId));
  const cp = pays.filter(p => p.company === co);
  const cmov = movs.filter(m => m.company === co);
  const cct = contracts.filter(x => x.company === co);
  const cbn = bonifs.filter(b => ce.some(e => e.id === b.employeeId));
  const en = id => emps.find(e => e.id === id)?.fullName || "—";
  const cc = COMPANIES[co];

  const allNav = [
    // Mi RRHH va PRIMERO para todos (20-oct-2026, Gerson: "antes de Dashboard,
    // también para mí y la Lic. que tenemos acceso completo").
    { id: "mi", icon: "🙋", label: "Mi RRHH" },
    { id: "dashboard", icon: "📊", label: "Dashboard" },
    { id: "kpis", icon: "📈", label: "KPI's" },
    { id: "employees", icon: "👥", label: "Empleados" },
    { id: "contracts", icon: "📝", label: "Contratos" },
    // "bonuses" (Bonificaciones) oculto a pedido del usuario 21-jul-2026 —
    // el codigo y la data siguen intactos; re-agregar aqui para reactivar.
    { id: "payroll", icon: "💰", label: "Planilla" },
    // Vacaciones · Permisos · Constancias viven dentro de "Solicitudes" (hub,
    // 20-oct-2026): la bandeja de lo que pide la gente + los registros.
    { id: "solicitudes", icon: "📥", label: "Solicitudes", badge: solicitudes.filter(x => estaAbierta(x) && x.solicitadoPor?.username !== userKey).length },
    // Asistencia · Llegadas tardías · Horas extras · GeoClock = UNA pestaña
    // (hub, 23-oct-2026). Badge = llegadas tarde sin decidir de esta empresa.
    { id: "asistencia", icon: "⏱️", label: "Asistencia", badge: Object.values(gcMarks).flat().filter(mk => mk && mk.company === co && mk.tipo === "entrada" && mk.tarde && !(gcTardies || []).some(t => t && t.markId === mk.id && (t.estado === "aprobada" || t.estado === "denegada"))).length },
    { id: "movimientos", icon: "🔄", label: "Movimientos" },
    { id: "costos", icon: "💵", label: "Costos" },
    // Accesos al sistema (solo admin): usuarios de GeoSupply desde la ficha.
    ...(puedeAccesos ? [{ id: "accesos", icon: "🔑", label: "Accesos" }] : []),
  ];
  // Pestañas que ve Ana (asistente_compras): todo lo operativo de personal,
  // sin nada de dinero (planilla/costos) ni el reporte de altas y bajas.
  // "tardanzas" SÍ (ella gestiona las explicaciones), pero los montos del
  // descuento van gateados por hideSalary dentro de la pestaña.
  const ANA_TABS = ["employees", "contracts", "solicitudes", "asistencia", "mi"];
  const nav = esPortalSolo ? allNav.filter(n => n.id === "mi")
    : isAsistente ? allNav.filter(n => ["asistencia", "mi"].includes(n.id))
    : isPhotoOnly ? allNav.filter(n => ["employees", "mi"].includes(n.id))
    : isOscarTardies ? allNav.filter(n => ["asistencia", "mi"].includes(n.id))
    : isAnaRH ? allNav.filter(n => ANA_TABS.includes(n.id))
    : allNav;
  // Las secciones viejas (attendance / tardanzas / horasextras) ahora viven
  // dentro del hub "asistencia": estos dos helpers traducen los atajos.
  const SUB_ASIS = { attendance: "hojas", tardanzas: "tardanzas", horasextras: "he" };
  const tieneSec = (id) => nav.some(n => n.id === (SUB_ASIS[id] ? "asistencia" : id));
  const irA = (id) => { if (SUB_ASIS[id]) { setAsisSub(SUB_ASIS[id]); setSec("asistencia"); } else setSec(id); };

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!loaded || (sec !== "dashboard" && sec !== "kpis")) return;
    setGrafAnim(0);
    let r2; const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setGrafAnim(1)); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, [sec, loaded, co]);
  if (!loaded) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#F9F9F8", fontFamily: "inherit", color: "#6E6862", fontSize: 13, letterSpacing: ".04em" }}>Cargando GeoTeam…</div>;

  // ── FORMS ──
  const EmpForm = ({ emp, onSave }) => {
    const [f, setF] = useState(emp || { company: co, fullName: "", dni: "", position: "", department: "", contractType: "permanent", startDate: "", endDate: "", salary: "", bonificacion: 0, status: "active", phone: "", email: "", sexo: "", horario: "" });
    const [uploading, setUploading] = useState(false);
    // Sync del form cuando el emp externo cambia (ej. sube foto y m.d se
    // actualizo desde afuera, o cambia el empleado seleccionado). Sin esto,
    // el useState solo se init una vez y no reflejaria cambios externos.
    useEffect(() => {
      if (emp) setF(emp);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [emp?.id, emp?.photo?.fileId]);
    const u = (k, v) => setF(p => ({ ...p, [k]: v }));

    // Upload de foto: lee file como dataUrl, sube a cp-file-<uuid> y guarda
    // la referencia liviana en el objeto empleado (fileId, name, type, size).
    // El dataUrl se agrega tambien al cache local para preview inmediato.
    const [uploadStep, setUploadStep] = useState("");

    // Comprime la imagen a max 400px + JPEG quality 0.75.
    // Reduce fotos de celular/PNG grandes a ~30-80 KB. Cada paso tiene su
    // propio timeout para que si algun paso se cuelga se diagnostique claro.
    const compressImage = (file) => new Promise((resolve, reject) => {
      const timeoutMs = 15000;
      const timeoutId = setTimeout(() => reject(new Error(`Compresion tardo mas de ${timeoutMs}ms — imagen muy grande o navegador lento`)), timeoutMs);
      const img = new Image();
      const fr = new FileReader();
      fr.onerror = () => { clearTimeout(timeoutId); reject(new Error("FileReader fallo")); };
      fr.onload = () => {
        img.onerror = () => { clearTimeout(timeoutId); reject(new Error("Image decode fallo (posible PNG corrupto)")); };
        img.onload = () => {
          try {
            console.log(`[EmpForm] Imagen decodificada: ${img.width}x${img.height} px`);
            const MAX = 400; // mas agresivo — quedan fotos de perfil chicas
            const scale = Math.min(1, MAX / Math.max(img.width, img.height));
            const w = Math.round(img.width * scale);
            const h = Math.round(img.height * scale);
            const canvas = document.createElement("canvas");
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
            clearTimeout(timeoutId);
            resolve(dataUrl);
          } catch (e) { clearTimeout(timeoutId); reject(e); }
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });

    const withTimeout = (promise, ms, label = "operation") => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout ${ms}ms — ${label} no respondio`)), ms)),
    ]);

    const handlePhotoFile = async (file) => {
      if (!file) return;
      if (!file.type?.startsWith("image/")) { alert("Selecciona un archivo de imagen (JPG/PNG)."); return; }
      setUploading(true);
      try {
        // 1) Comprimir localmente
        setUploadStep("Comprimiendo imagen...");
        console.log(`[EmpForm] Comprimiendo foto original ${(file.size/1024).toFixed(0)} KB (${file.type})...`);
        const dataUrl = await compressImage(file);
        const approxKB = Math.round((dataUrl.length * 0.75) / 1024);
        console.log(`[EmpForm] Comprimida a ~${approxKB} KB dataUrl length ${dataUrl.length}`);

        // 2) Subir con timeout 25s
        setUploadStep(`Subiendo (${approxKB} KB) a la nube...`);
        const fileId = uid();
        console.log(`[EmpForm] Subiendo a cp-file-${fileId}...`);
        const ok = await withTimeout(
          store.set(`cp-file-${fileId}`, { name: file.name, type: "image/jpeg", size: dataUrl.length, dataUrl }),
          25000,
          "upload foto a Supabase"
        );
        console.log(`[EmpForm] store.set devolvio: ${ok}`);
        if (!ok) throw new Error("Supabase rechazo el upload despues de 3 reintentos. Chequea la consola para el error tecnico.");

        // 3) Verify: releer para confirmar que quedo
        setUploadStep("Verificando...");
        const verify = await withTimeout(store.get(`cp-file-${fileId}`), 15000, "verify foto");
        if (!verify?.dataUrl) throw new Error("Supabase acepto el save pero no puede leer el archivo de vuelta. Reintenta.");

        // 4) Actualizar UI
        const newPhoto = { fileId, name: file.name, type: "image/jpeg", size: dataUrl.length };
        setPhotoCache(prev => ({ ...prev, [fileId]: dataUrl }));
        setF(p => ({ ...p, photo: newPhoto }));

        // 5) PERSISTIR INMEDIATO al empleado si estamos editando uno existente.
        // Ademas, sync el modal state (m.d) para que si EmpForm se remonta
        // por un re-render del padre, el nuevo emp inicial ya tenga la foto
        // (evita que se resetee a "Sin foto" tras el re-mount).
        if (emp && emp.id) {
          sE(emps.map(x => x.id === emp.id ? { ...x, photo: newPhoto } : x));
          setModal(prev => (prev && prev.t === "ee" && prev.d?.id === emp.id)
            ? { ...prev, d: { ...prev.d, photo: newPhoto } }
            : prev);
          console.log(`[EmpForm] ✅ Foto subida + guardada al empleado ${emp.id} + sync modal (${fileId})`);
        } else {
          console.log(`[EmpForm] ✅ Foto subida (empleado nuevo — se persiste al hacer "Agregar")`);
        }
      } catch (err) {
        console.error("[EmpForm] ❌ Error subiendo foto:", err);
        alert(`Fallo en el paso: "${uploadStep}"\n\nError: ${err?.message || err}\n\nAbri la consola del navegador (Cmd+Option+I) y mandame lo que sale en rojo/warning.`);
      } finally {
        setUploading(false);
        setUploadStep("");
      }
    };
    const removePhoto = () => setF(p => ({ ...p, photo: null }));

    const currentPhotoUrl = f.photo?.fileId ? photoCache[f.photo.fileId] : null;

    return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      {/* Bloque de foto arriba, span completo */}
      <div style={{ gridColumn: "1/-1", display: "flex", alignItems: "center", gap: 18, padding: "14px 16px", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10 }}>
        <EmpAvatar name={f.fullName} dataUrl={currentPhotoUrl} size={82} borderRadius={12} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Foto del empleado</div>
          {isPhotoOnly && (
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1E293B", lineHeight: 1.3 }}>
              {f.fullName || "—"}{f.position ? <span style={{ fontWeight: 400, color: "#64748b" }}> — {f.position}</span> : null}
            </div>
          )}
          <div style={{ fontSize: 11, color: uploading ? "#B45309" : "#64748b", marginBottom: 4, fontWeight: uploading ? 700 : 400 }}>
            {uploading ? `⏳ ${uploadStep || "Procesando..."}` : (f.photo ? (f.photo.name || "Imagen cargada") : "Sin foto — se usan las iniciales.")}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "#2C5F5D", color: "#fff", border: "none", borderRadius: 8, cursor: uploading ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, opacity: uploading ? 0.6 : 1 }}>
              {uploading ? (uploadStep || "Procesando...") : (f.photo ? "Cambiar foto" : "Subir foto")}
              <input type="file" accept="image/*" style={{ display: "none" }} disabled={uploading}
                onChange={(ev) => { const file = ev.target.files?.[0]; ev.target.value = ""; if (file) handlePhotoFile(file); }} />
            </label>
            {f.photo && <Btn small variant="ghost" onClick={removePhoto}>Eliminar</Btn>}
          </div>
        </div>
      </div>
      {isPhotoOnly ? (
        <div style={{ gridColumn: "1/-1", fontSize: 12, color: "#64748b", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: "10px 14px" }}>
          📷 La foto se guarda automáticamente al subirla. Cuando termines, tocá <b>Cerrar</b>.
        </div>
      ) : (<>
        <Input label="Nombre completo" value={f.fullName} onChange={e => u("fullName", e.target.value)} />
        <Input label="DNI" value={f.dni} onChange={e => u("dni", e.target.value)} />
        <Input label="Cargo" value={f.position} onChange={e => u("position", e.target.value)} />
        <Select label="Departamento" options={DEPARTMENTS} value={f.department} onChange={e => u("department", e.target.value)} />
        <Select label="Contrato" options={[{ value: "permanent", label: "Permanente" }, { value: "temporary", label: "Temporal" }, { value: "honorarios", label: "Honorarios" }]} value={f.contractType} onChange={e => u("contractType", e.target.value)} />
        <Select label="Estado" options={[{ value: "active", label: "Activo" }, { value: "inactive", label: "Inactivo" }]} value={f.status} onChange={e => u("status", e.target.value)} />
        <Input label="Fecha inicio" type="date" value={f.startDate} onChange={e => u("startDate", e.target.value)} />
        {/* En un empleado INACTIVO este campo ES el último día en la empresa
            (se le paga hasta ahí) y la asistencia se bloquea desde el día
            siguiente. En un temporal activo es el fin de contrato. */}
        {(f.contractType === "temporary" || f.status === "inactive") && <Input label={f.status === "inactive" ? "Último día en la empresa" : "Fecha fin"} type="date" value={f.endDate} onChange={e => u("endDate", e.target.value)} />}
        {f.status === "inactive" && <div style={{ gridColumn: "1/-1", fontSize: 11.5, color: "#7F1D1D", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 12px" }}>
          Se le paga <b>hasta el último día</b> en la empresa (inclusive). Desde el día siguiente la asistencia queda en gris.
        </div>}
        {/* Salario y bonificación: ocultos para roles sin acceso a montos
            (Ana). Al no renderizar los inputs, `f` conserva los valores
            originales del empleado y el guardado NO los pisa. */}
        {hideSalary ? (
          <div style={{ gridColumn: "1/-1", fontSize: 12, color: "#64748b", background: "#F8FAFC", border: "1px dashed #CBD5E1", borderRadius: 8, padding: "9px 13px" }}>
            🔒 El salario y la bonificación no se muestran con tu usuario — se conservan tal cual al guardar.
          </div>
        ) : (<>
          <Input label="Salario bruto (L)" type="number" value={f.salary} onChange={e => u("salary", e.target.value)} />
          <Input label="Bonificacion (L)" type="number" value={f.bonificacion || 0} onChange={e => u("bonificacion", e.target.value)} />
        </>)}
        <Input label="Telefono" value={f.phone || ""} onChange={e => u("phone", e.target.value)} placeholder="9999-9999" />
        <Input label="Email" type="email" value={f.email || ""} onChange={e => u("email", e.target.value)} placeholder="empleado@correo.com" />
        {/* Sexo (KPI de estructura del personal) + Horario (GeoClock) — ago 2026 */}
        <Select label="Sexo" options={[{ value: "masculino", label: "Masculino" }, { value: "femenino", label: "Femenino" }]} value={f.sexo || ""} onChange={e => u("sexo", e.target.value)} />
        <Select label="Horario de trabajo" options={[
          { value: "plantel", label: "Campo (7:00 – 16:00)" },
          { value: "oficina", label: "Oficina (8:00 – 17:00)" },
          { value: "especial", label: "Especial (9:00 – 18:00)" },
          { value: "custom", label: "Personalizado" },
        ]} value={f.horario || ""} onChange={e => u("horario", e.target.value)} />
        {f.horario === "custom" && <>
          <Input label="Entrada (personalizado)" type="time" value={f.horarioEntrada || ""} onChange={e => u("horarioEntrada", e.target.value)} />
          <Input label="Salida (personalizado)" type="time" value={f.horarioSalida || ""} onChange={e => u("horarioSalida", e.target.value)} />
        </>}
        <div style={{ gridColumn: "1/-1", fontSize: 11, color: "#64748b", background: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: 8, padding: "8px 12px" }}>
          🕒 <b>GeoClock</b> usa el horario para la tolerancia de {TOLERANCIA_MIN} min al marcar entrada (ej. campo: 7:00–7:15). Sin horario asignado se asume <b>Campo (7:00–16:00)</b>. El descuento por llegada tarde denegada se calcula desde la hora de entrada de ESTE horario.
        </div>
        {/* NO REQUIERE MARCAJE (24-ago-2026, pedido de Gerson): jefaturas y
            personal que no marca en la tablet. Sin esto aparecían todos los
            días como ausentes en Registros y en las sugerencias de NSP. */}
        <label style={{ gridColumn: "1/-1", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#EEF2FF", border: "1px solid #C7D2FE", borderRadius: 10, fontSize: 13, color: "#3730A3", cursor: "pointer" }}>
          <input type="checkbox" checked={!!f.noMarca} onChange={e => u("noMarca", e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#4F46E5" }} />
          <span>
            <b>No requiere marcaje en GeoClock</b>
            <div style={{ fontSize: 11, color: "#4338CA", marginTop: 2 }}>
              Para jefaturas y personal que no marca entrada/salida en la tablet. No aparece en el reloj, no sale como "NO MARCÓ" en Registros y no se le sugiere NSP en la asistencia. Su día se maneja normal en la hoja.
            </div>
          </span>
        </label>
        <label style={{ gridColumn: "1/-1", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 10, fontSize: 13, color: "#92400E", cursor: "pointer" }}>
          <input type="checkbox" checked={!!f.payByHour} onChange={e => u("payByHour", e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
          <span>
            <b>Pago proporcional por hora de entrada</b>
            <div style={{ fontSize: 11, color: "#78350F", marginTop: 2 }}>
              Activá esto solo para empleados que cobran segun la hora a la que llegan (ej: trabajadores con horario flexible). Vas a poder marcar la hora de entrada (7:00 a 11:00, cada 30 min) en cada celda de asistencia con click derecho.
            </div>
          </span>
        </label>
      </>)}
      {emp?.id && <EquipoAsignadoInv empId={emp.id} />}
      <div style={{ gridColumn: "1/-1", display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
        {isPhotoOnly ? (
          <Btn variant="ghost" onClick={() => setModal(null)}>Cerrar</Btn>
        ) : (<>
          <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
          <Btn variant="success" onClick={() => { if (!f.fullName) return alert("Nombre requerido"); onSave({ ...f, id: f.id || uid(), company: f.company || co }); setModal(null); }}>{emp ? "Guardar" : "Agregar"}</Btn>
        </>)}
      </div>
    </div>;
  };

  // ── Simple forms ──
  const VacForm = ({ vac, onSave }) => { const [f, setF] = useState(vac || { employeeId: "", startDate: "", endDate: "", notes: "", status: "pending" }); const u = (k, v) => setF(p => ({ ...p, [k]: v })); const d = f.startDate && f.endDate ? daysBetween(f.startDate, f.endDate) : 0; return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}><Select label="Empleado" options={ae.map(e => ({ value: e.id, label: e.fullName }))} value={f.employeeId} onChange={e => u("employeeId", e.target.value)} /><Select label="Estado" options={[{ value: "pending", label: "Pendiente" }, { value: "approved", label: "Aprobado" }, { value: "rejected", label: "Rechazado" }]} value={f.status} onChange={e => u("status", e.target.value)} /><Input label="Inicio" type="date" value={f.startDate} onChange={e => u("startDate", e.target.value)} /><Input label="Fin" type="date" value={f.endDate} onChange={e => u("endDate", e.target.value)} />{d > 0 && <div style={{ gridColumn: "1/-1", background: "#EFF6FF", padding: 10, borderRadius: 8, fontSize: 13 }}>Dias: <b>{d}</b></div>}<div style={{ gridColumn: "1/-1" }}><Input label="Notas" value={f.notes} onChange={e => u("notes", e.target.value)} /></div><div style={{ gridColumn: "1/-1", display: "flex", justifyContent: "flex-end", gap: 10 }}><Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn><Btn variant="success" onClick={() => { if (!f.employeeId) return; onSave({ ...f, id: f.id || uid(), days: d }); setModal(null); }}>{vac ? "Actualizar" : "Registrar"}</Btn></div></div>; };
  const LvForm = ({ lv, onSave }) => { const [f, setF] = useState(lv || { employeeId: "", date: "", type: "", reason: "", status: "approved" }); const u = (k, v) => setF(p => ({ ...p, [k]: v })); return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}><Select label="Empleado" options={ae.map(e => ({ value: e.id, label: e.fullName }))} value={f.employeeId} onChange={e => u("employeeId", e.target.value)} /><Select label="Tipo" options={LEAVE_TYPES} value={f.type} onChange={e => u("type", e.target.value)} /><Input label="Fecha" type="date" value={f.date} onChange={e => u("date", e.target.value)} /><Select label="Estado" options={[{ value: "approved", label: "Aprobado" }, { value: "pending", label: "Pendiente" }]} value={f.status} onChange={e => u("status", e.target.value)} /><div style={{ gridColumn: "1/-1" }}><Input label="Motivo" value={f.reason} onChange={e => u("reason", e.target.value)} /></div><div style={{ gridColumn: "1/-1", display: "flex", justifyContent: "flex-end", gap: 10 }}><Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn><Btn variant="success" onClick={() => { if (!f.employeeId) return; onSave({ ...f, id: f.id || uid() }); setModal(null); }}>{lv ? "Actualizar" : "Registrar"}</Btn></div></div>; };

  // ── CUADRILLA DISTRIBUTION ──
  // cuad (opcional): cuadrilla existente a editar. Cuando viene, el form
  // arranca DIRECTO en el paso 2 con esa quincena y sus asignaciones
  // cargadas — sin volver a preguntar periodo/quincena.
  const CuadrillaForm = ({ cuad }) => {
    const [per, setPer] = useState(cuad?.periodo || "");
    const [q, setQ] = useState(cuad?.quincena || "2Q");
    const [assignments, setAssignments] = useState(cuad?.assignments ? { ...cuad.assignments } : {});
    const [step, setStep] = useState(cuad ? 2 : 1);

    const initAssign = () => {
      if (!per) return alert("Seleccione periodo");
      const existing = cq.find(x => x.periodo === per && x.quincena === q);
      if (existing) { setAssignments(existing.assignments); setStep(2); return; }
      // Quincena nueva: arrancar COPIANDO la distribución más reciente de la
      // empresa (ago 2026) — antes sembraba desde e.project y había que
      // re-asignar a todos. Los que no estaban en esa cuadrilla caen a su
      // e.project. Igual se puede cambiar todo antes de guardar.
      const previa = cq.slice().sort((a, b) => `${b.periodo}-${b.quincena}`.localeCompare(`${a.periodo}-${a.quincena}`))[0];
      const a = {};
      ae.forEach(e => { a[e.id] = (previa?.assignments || {})[e.id] || e.project || ""; });
      setAssignments(a); setStep(2);
      if (previa) console.info(`[cuadrilla] ${q} ${per} sembrada desde ${previa.quincena} ${previa.periodo}`);
    };

    // projEmps: empleados asignados a un proyecto. Usa resolveShort para reconocer
    // aliases (ej: "VILLA ROY" → "VILLAROY", "PLAN-TALLER" → "PLANTEL-OFICINA")
    // y no perder empleados cuyo nombre de proyecto cambio.
    const projEmps = (proj) => ae.filter(e => resolveShortHR(assignments[e.id]) === proj);
    // unassigned: empleados sin asignacion valida. Incluye:
    //   - sin valor (vacio, null, undefined)
    //   - con valor pero apuntando a un proyecto que ya no existe (data stale)
    // De esta forma ningun empleado queda invisible en la pantalla.
    const unassigned = ae.filter(e => {
      const a = assignments[e.id];
      if (!a) return true;
      return !findProjectHR(a);
    });

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
          {hrProjects.map(proj => (
            <div key={proj.short} style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: cc.color, display: "flex", justifyContent: "space-between" }}>
                <span>{proj.short}{proj.isCustom && <span title="Proyecto creado en GeoShopping" style={{ fontSize: 9, color: "#BE185D", fontWeight: 700, marginLeft: 6 }}>● compras</span>}</span><Badge color={cc.color}>{projEmps(proj.short).length}</Badge>
              </div>
              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 8 }}>{proj.code ? `[${proj.code}] ` : ""}{proj.name}</div>
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
                {hrProjects.map(p => <option key={p.short} value={p.short}>{p.short} — {p.name}</option>)}
              </select>
            </div>
          ))}
        </div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
          <Btn variant="success" onClick={async () => {
            const record = { id: uid(), company: co, periodo: per, quincena: q, assignments, date: new Date().toISOString() };
            const existing = cuadrillas.findIndex(x => x.company === co && x.periodo === per && x.quincena === q);
            const next = existing >= 0
              ? cuadrillas.map((x, i) => i === existing ? record : x)
              : [...cuadrillas, record];
            // AWAIT: la cuadrilla es la base de asistencia y planilla — si la
            // nube fallo hay que avisar, no cerrar como si nada (antes era
            // fire-and-forget y los fallos quedaban en silencio).
            const ok = await sCq(next);
            const updated = emps.map(e => assignments[e.id] ? { ...e, project: assignments[e.id] } : e);
            sE(updated);
            if (!ok) {
              alert(
                "⚠️ La distribucion se guardo en este dispositivo pero NO se sincronizo a la nube.\n\n" +
                "Revisa tu conexion a internet y volve a tocar \"Guardar distribucion\".\n" +
                "Si abris el sistema en otra compu antes de sincronizar, esta cuadrilla no va a aparecer."
              );
              return; // modal queda abierto para reintentar sin re-armar todo
            }
            setModal(null);
          }}>Guardar distribucion</Btn>
        </div>
      </>}
    </div>;
  };

  // ── ATTENDANCE GRID ──
  const AttendanceGrid = ({ sheet }) => {
    // Respaldo anti-remount (igual que HorasExtrasGrid): si el padre se
    // re-renderiza a mitad de digitacion (fotos cargando, resize), la grid
    // remonta y este draft restaura lo marcado. Solo se restaura si tiene
    // cambios (dirty) y NUNCA sobrevive al cierre del modal.
    const attKey = `${sheet.company}|${sheet.periodo}|${sheet.quincena}`;
    const attDraft = attDraftRef.current && attDraftRef.current.key === attKey && attDraftRef.current.dirty ? attDraftRef.current : null;
    // Auto-rellena domingos y feriados con "1" como valor por defecto.
    // Razon: la ley hondurena paga el domingo (dia de descanso) y los feriados
    // como dia normal aun si el empleado no trabaja. El usuario solo cambia a
    // DT/DT2 (domingo trabajado) o TF (feriado trabajado) si efectivamente
    // trabajaron. Respeta el bloqueo por alta/baja (no rellena dias fuera de
    // rango: a un dado de baja NO se le paga el domingo posterior). Solo
    // rellena celdas que esten vacias — no sobrescribe valores existentes
    // (ya marcados, o explicitamente puestos por el usuario).
    const initialData = (() => {
      if (attDraft) return attDraft.data;
      const initial = { ...(sheet?.grid || {}) };
      const [y, m] = sheet.periodo.split("-").map(Number);
      const start = sheet.quincena === "1Q" ? 1 : 16;
      const lastDay = new Date(y, m, 0).getDate();
      const end = sheet.quincena === "1Q" ? 15 : lastDay;
      for (let d = start; d <= end; d++) {
        const dt = new Date(y, m - 1, d);
        const isSun = dt.getDay() === 0;
        const isHoliday = esFeriadoQuincena(sheet.periodo, d);
        if (!isSun && !isHoliday) continue;
        const dStr = `${sheet.periodo}-${String(d).padStart(2, "0")}`;
        ae.forEach(e => {
          const k = `${e.id}-${d}`;
          if (initial[k]) return;
          if (e.startDate && dStr < e.startDate) return;
          if (fueraPorBaja(e, dStr)) return;
          initial[k] = "1";
        });
      }
      // SIEMBRA de VACACIONES y PERMISOS ya registrados (ago 2026): si Ana
      // registró las vacaciones ANTES de que existiera esta hoja, acá se
      // marcan solas. Mismas reglas: nada en domingos/feriados (ya son "1"),
      // nada en días bloqueados por alta/baja, y NO se pisa lo ya marcado.
      const enRango = (dStr) => {
        const [yy, mm, dd] = dStr.split("-").map(Number);
        return { yy, mm, dd };
      };
      (vacs || []).forEach(v => {
        if (!v || !v.employeeId || v.status === "rejected" || !v.startDate) return;
        const e = ae.find(x => x.id === v.employeeId);
        if (!e) return;
        for (let d = start; d <= end; d++) {
          const dStr = `${sheet.periodo}-${String(d).padStart(2, "0")}`;
          if (dStr < String(v.startDate).slice(0, 10)) continue;
          if (dStr > String(v.endDate || v.startDate).slice(0, 10)) continue;
          const dt = new Date(y, m - 1, d);
          if (dt.getDay() === 0 || esFeriadoQuincena(sheet.periodo, d)) continue;
          if (e.startDate && dStr < e.startDate) continue;
          if (fueraPorBaja(e, dStr)) continue;
          const k = `${e.id}-${d}`;
          // RECONCILIA: hr-vacs es la fuente de verdad, así que también
          // convierte un "1" (autorrelleno o pisado por un guardado con la
          // hoja abierta) a "V". Nunca toca 0/INC/DT/DT2/TF.
          const cur = initial[k] || "";
          if (cur !== "" && cur !== "1") continue;
          initial[k] = "V";
        }
      });
      (lvs || []).forEach(l => {
        if (!l || !l.employeeId || l.status === "rejected" || !l.date) return;
        const e = ae.find(x => x.id === l.employeeId);
        if (!e) return;
        const dStr = String(l.date).slice(0, 10);
        const { yy, mm, dd } = enRango(dStr);
        if (`${yy}-${String(mm).padStart(2, "0")}` !== sheet.periodo) return;
        if (dd < start || dd > end) return;
        const dt = new Date(y, m - 1, dd);
        if (dt.getDay() === 0 || esFeriadoQuincena(sheet.periodo, dd)) return;
        if (e.startDate && dStr < e.startDate) return;
        if (fueraPorBaja(e, dStr)) return;
        const k = `${e.id}-${dd}`;
        if (initial[k]) return;
        initial[k] = String(l.type || "").toLowerCase().includes("sin goce") ? "0" : "1";
      });
      // SIEMBRA de MARCAJES GeoClock (ago 2026): cada ENTRADA registrada en
      // el reloj marca "1" si la celda esta vacia — el marcaje ALIMENTA la
      // asistencia de la quincena. Solo llena vacios: nunca pisa lo que RRHH
      // marco a mano (0/INC/V/DT...), y los domingos/feriados ya valen "1".
      ((gcMarks[`${sheet.periodo}|${sheet.quincena}`]) || []).forEach(mk => {
        if (!mk || mk.tipo !== "entrada" || !mk.empId || !mk.fecha) return;
        const e = ae.find(x => x.id === mk.empId);
        if (!e) return;
        const dStr = String(mk.fecha).slice(0, 10);
        if (dStr.slice(0, 7) !== sheet.periodo) return;
        const dd = Number(dStr.slice(8, 10));
        if (!dd || dd < start || dd > end) return;
        const dt = new Date(y, m - 1, dd);
        if (dt.getDay() === 0 || esFeriadoQuincena(sheet.periodo, dd)) return;
        if (e.startDate && dStr < e.startDate) return;
        if (fueraPorBaja(e, dStr)) return;
        const k = `${e.id}-${dd}`;
        if (initial[k]) return;
        initial[k] = "1";
      });
      return initial;
    })();
    // Horas de entrada iniciales: las de la hoja + las de llegadas tarde
    // DENEGADAS por RRHH (gc-tardies) que aun no esten fijadas — asi la hoja
    // se auto-repara aunque la decision se haya tomado antes de crearla.
    const initialArrivals = (() => {
      if (attDraft) return attDraft.arrivalTimes;
      const at = { ...(sheet?.arrivalTimes || {}) };
      const _start = sheet.quincena === "1Q" ? 1 : 16;
      const [_y, _m] = sheet.periodo.split("-").map(Number);
      const _end = sheet.quincena === "1Q" ? 15 : new Date(_y, _m, 0).getDate();
      ((gcMarks[`${sheet.periodo}|${sheet.quincena}`]) || []).forEach(mk => {
        if (!mk || mk.tipo !== "entrada" || !mk.tarde || !mk.hora) return;
        const dec = (gcTardies || []).find(t => t && t.markId === mk.id);
        if (!dec || dec.estado !== "denegada") return;
        const e = ae.find(x => x.id === mk.empId);
        if (!e) return;
        const dStr = String(mk.fecha).slice(0, 10);
        if (dStr.slice(0, 7) !== sheet.periodo) return;
        const dd = Number(dStr.slice(8, 10));
        if (!dd || dd < _start || dd > _end) return;
        if (new Date(_y, _m - 1, dd).getDay() === 0 || esFeriadoQuincena(sheet.periodo, dd)) return;
        const k = `${e.id}-${dd}`;
        if (!at[k]) at[k] = mk.hora;
      });
      return at;
    })();
    const [data, setData] = useState(initialData);
    const [overrides, setOverrides] = useState(() => attDraft ? attDraft.overrides : (sheet?.projOverrides || {}));
    const [arrivalTimes, setArrivalTimes] = useState(initialArrivals);
    const [editingCell, setEditingCell] = useState(null);
    // Track de cambios sin guardar para advertir al cerrar.
    // Empieza limpio al abrir; cada edicion marca dirty=true.
    const [dirty, setDirty] = useState(attDraft ? true : false);
    const attSavingRef = useRef(false);
    // Espejar el estado al respaldo en CADA cambio (proteccion anti-remount).
    useEffect(() => {
      attDraftRef.current = { key: attKey, data, overrides, arrivalTimes, dirty };
    }, [attKey, data, overrides, arrivalTimes, dirty]);

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
    // Grupos de proyecto del grid — sobre la lista unificada (base + compras).
    // Red de seguridad: si una asignacion apunta a un proyecto que ya no esta
    // en la lista (borrado/renombrado en compras), se crea un grupo "fantasma"
    // con el short crudo para que NINGUN empleado desaparezca del grid.
    const assignedShorts = [...new Set(ae.map(e => resolveShortHR(assignments[e.id])).filter(Boolean))];
    const projGroups = hrProjects.filter(p => assignedShorts.includes(p.short) || ae.some(e => assignments[e.id] === p.short));
    assignedShorts.forEach(s => {
      if (!projGroups.some(p => p.short === s)) projGroups.push({ short: s, name: s, code: "" });
    });

    // Determina si un dia esta bloqueado para un empleado.
    //
    // Reglas (alineadas con el flujo real de altas/bajas):
    //   1. Siempre: dias ANTES del startDate del empleado quedan bloqueados.
    //      Esto cubre altas a mitad de quincena (ej: alta el 8 → dias 1-7 grises).
    //
    //   2. Solo cuando el empleado tiene status "inactive" (baja registrada):
    //      los dias DESPUES del ultimo dia en la empresa quedan bloqueados (ej:
    //      ultimo dia el 8 → dias 9-15 grises, domingos incluidos). Ver `fueraPorBaja` arriba.
    //      El status "inactive" lo setea BajaForm junto con el endDate, asi
    //      que es la fuente de verdad.
    //
    // Por que no chequeamos endDate cuando status === "active":
    //   Los contratos temporales tienen endDate inicial al darlos de alta.
    //   Si el contrato se renueva (modulo Contratos), el empleado sigue
    //   activo pero el endDate del empleado queda viejo. Antes esto bloqueaba
    //   indebidamente la asistencia de gente activa. Ahora respetamos status.
    const dayLockReason = (e, dayObj) => {
      const dStr = `${sheet.periodo}-${String(dayObj.day).padStart(2, "0")}`;
      if (e.startDate && dStr < e.startDate) return `Antes del alta (${e.startDate})`;
      if (fueraPorBaja(e, dStr)) {
        return `Su último día en la empresa fue el ${e.endDate}`;
      }
      return null;
    };

    const cellKey = (eid, day) => `${eid}-${day}`;
    const getVal = (eid, day) => data[cellKey(eid, day)] || "";
    const getProj = (eid, day) => overrides[cellKey(eid, day)] || null;

    // SUGERENCIA de NSP (ago 2026, regla del "1 verde"): en los proyectos
    // donde opera GeoClock (PLANTEL / ADMINISTRACIÓN), un día ya CERRADO en
    // el que la tablet SÍ registró entradas pero un asignado no marcó la suya
    // y su celda sigue vacía = probable NO SE PRESENTÓ. El sistema solo
    // SUGIERE: el 0 lo confirma RRHH con el botón, se aplica al BORRADOR y
    // nada se persiste hasta tocar "Guardar asistencia". Días sin ningún
    // marcaje (tablet apagada / antes de GeoClock) no generan sugerencias.
    const esProjClock = (short) => /PLANTEL|ADMINISTRA/i.test(String(short || ""));
    const nspSugeridos = (() => {
      const marks = (gcMarks[`${sheet.periodo}|${sheet.quincena}`]) || [];
      if (!marks.length) return [];
      const hoy = hoyTegus();
      const diasConMarcaje = new Set(marks
        .filter(mk => mk && mk.tipo === "entrada" && mk.fecha)
        .map(mk => String(mk.fecha).slice(0, 10)));
      const marcoEntrada = (eid, dStr) => marks.some(mk =>
        mk && mk.tipo === "entrada" && mk.empId === eid && String(mk.fecha).slice(0, 10) === dStr);
      const out = [];
      ae.forEach(e => {
        if (e.noMarca) return;   // jefaturas: no marcan, no se les sugiere NSP
        const short = resolveShortHR(assignments[e.id]) || assignments[e.id];
        if (!esProjClock(short)) return;
        const dias = [];
        days.forEach(d => {
          if (d.isSun || d.isHoliday) return;
          const dStr = `${sheet.periodo}-${String(d.day).padStart(2, "0")}`;
          if (dStr >= hoy) return;
          if (!diasConMarcaje.has(dStr)) return;
          if (dayLockReason(e, d)) return;
          if (getVal(e.id, d.day) !== "") return;
          if (marcoEntrada(e.id, dStr)) return;
          dias.push(d.day);
        });
        if (dias.length) out.push({ e, dias });
      });
      return out;
    })();
    const aplicarNsp = () => {
      if (!nspSugeridos.length) return;
      const n = nspSugeridos.reduce((s, r) => s + r.dias.length, 0);
      if (!confirm(`¿Marcar 0 (NSP) en ${n} día(s) de ${nspSugeridos.length} colaborador(es)?\n\nSe aplican al borrador de la hoja — revisá y tocá "Guardar asistencia" para confirmarlos. Si alguien tenía permiso, vacación o andaba en proyecto, corregí esa celda a mano.`)) return;
      setData(prev => {
        const nx = { ...prev };
        nspSugeridos.forEach(({ e, dias }) => dias.forEach(dd => { nx[`${e.id}-${dd}`] = "0"; }));
        return nx;
      });
      setDirty(true);
    };

    // Cycle de la celda al hacer click. Cambia segun el tipo de dia:
    //   - Dia regular (Lun-Sab no feriado): "" -> 1 -> 0 -> INC -> V -> ""
    //       (V = vacaciones, dia pagado — agregado 30-jul-2026)
    //   - Domingo (no feriado): 1 -> DT -> DT2 -> 0 -> INC -> 1
    //       (1 = descanso pagado por ley, DT = trabajado +1 dia, DT2 = triple +2 dias)
    //   - Feriado (cualquier dia de la semana): 1 -> TF -> 0 -> INC -> 1
    //       (1 = pagado por ley, TF = trabajado +2 dias = triple)
    const cycle = (eid, day) => {
      const emp = ae.find((x) => x.id === eid);
      const dayObj = days.find((d) => d.day === day);
      if (emp && dayObj && dayLockReason(emp, dayObj)) return;
      const k = cellKey(eid, day);
      const cur = data[k] || "";
      let next;
      if (dayObj?.isHoliday) {
        next = cur === "1" ? "TF" : cur === "TF" ? "0" : cur === "0" ? "INC" : "1";
      } else if (dayObj?.isSun) {
        next = cur === "1" ? "DT" : cur === "DT" ? "DT2" : cur === "DT2" ? "0" : cur === "0" ? "INC" : "1";
      } else {
        next = cur === "" ? "1" : cur === "1" ? "0" : cur === "0" ? "INC" : cur === "INC" ? "V" : "";
      }
      setData(d => ({ ...d, [k]: next }));
      setDirty(true);
    };
    const setOverride = (eid, day, proj) => {
      const k = cellKey(eid, day);
      if (proj === assignments[eid] || !proj) { setOverrides(o => { const n = { ...o }; delete n[k]; return n; }); }
      else { setOverrides(o => ({ ...o, [k]: proj })); }
      setEditingCell(null);
      setDirty(true);
    };

    // Setea hora de entrada para empleados con pago proporcional (e.g. José Miguel
    // que llega tarde y cobra segun la hora). Las opciones validas son 7:00 a
    // 11:00 en intervalos de 30 min (ampliado 30-jul-2026: José Miguel viene
    // llegando 10:30-11). Pasar "" limpia la hora del dia.
    const setArrivalTime = (eid, day, time) => {
      const k = cellKey(eid, day);
      if (!time) {
        setArrivalTimes(at => { const n = { ...at }; delete n[k]; return n; });
      } else {
        setArrivalTimes(at => ({ ...at, [k]: time }));
      }
      setEditingCell(null);
      setDirty(true);
    };
    const ARRIVAL_OPTIONS = ["7:00", "7:30", "8:00", "8:30", "9:00", "9:30", "10:00", "10:30", "11:00"];

    // Color de fondo de la celda. Distingue visualmente el "1" segun el tipo
    // de dia para que el calendario se lea como un calendario de Excel pintado:
    //   - "1" en feriado  → naranja claro (pagado por ley, no trabajo)
    //   - "1" en domingo  → azul claro (descanso pagado, no trabajo)
    //   - "1" en regular  → verde (presente trabajando)
    const palDe = (v, dayObj) => {
      if (v === "TF" || v === "DT" || v === "DT2") return PAL_CELDA.extra;
      if (v === "1") return (dayObj?.isHoliday || dayObj?.isSun) ? PAL_CELDA.descanso : PAL_CELDA.presente;
      if (v === "0") return PAL_CELDA.nsp;
      if (v === "INC") return PAL_CELDA.inc;
      if (v === "V") return PAL_CELDA.vac;
      return null;
    };
    // El override (1*) no cambia el color: lo dice el rótulo chico de abajo.
    const cellColor = (v, hasOvr, dayObj) => palDe(v, dayObj)?.bg || "transparent";
    const cellText = (v, ovr) => {
      const t = v === "1" ? "1"
        : v === "0" ? "0"
        : v === "INC" ? "I"
        : v === "V" ? "V"
        : v === "TF" ? "TF"
        : v === "DT" ? "DT"
        : v === "DT2" ? "DT2"
        : "";
      return ovr ? `${t}*` : t;
    };
    const cellFontColor = (v, dayObj) => palDe(v, dayObj)?.fg || "#D8D4CE";
    const cellFontSize = v => (v === "TF" || v === "DT" || v === "DT2") ? 9 : 11;

    // Calcula la fraccion del dia trabajado (1.0 = dia completo) para un
    // empleado segun su estado y la hora de entrada marcada.
    //   - INC siempre cuenta como 1 (incapacidad pagada completa)
    //   - Sin hora de entrada marcada, cualquier dia pagado vale 1
    //   - Con hora de entrada (payByHour manual o tardanza GeoClock
    //     DENEGADA), vale (8 - horasTarde)/8. Jornada de 8h desde la hora
    //     de entrada del HORARIO del empleado (default plantel 7am).
    const dayValueFor = (emp, day, val) => {
      if (val !== "1" && val !== "TF" && val !== "DT" && val !== "DT2") return (val === "INC" || val === "V") ? 1 : 0;
      const arr = arrivalTimes[`${emp?.id}-${day}`];
      if (!arr) return 1;
      const [h, mm] = arr.split(":").map(Number);
      const arrivalH = h + mm / 60;
      const lateHours = Math.max(0, arrivalH - horaLimiteH(emp));
      return Math.max(0, (8 - lateHours) / 8);
    };

    // Cuenta dias por categoria. Reglas:
    //   - present: cuenta entera de dias pagados (1, TF, DT, DT2, INC)
    //   - presentEffective: suma proporcional. Para empleados normales es igual
    //     a present (entero). Para payByHour aplica la fraccion por hora tardia.
    //   - absent: solo "0" en dia regular. En domingo/feriado el dia se paga
    //     por ley aunque marquen 0, asi que NO se cuenta como ausencia que descuente.
    //   - domTrab / domTrabTriple: domingos efectivamente trabajados (DT, DT2)
    //   - ferTrab: feriados efectivamente trabajados (TF)
    const empStats = (eid) => {
      const emp = ae.find(x => x.id === eid);
      let present = 0, presentEffective = 0;
      let absent = 0, incap = 0, vac = 0, domTrab = 0, domTrabTriple = 0, ferTrab = 0;
      days.forEach(d => {
        // Dias BLOQUEADOS por alta/baja NO cuentan aunque tengan un valor
        // guardado de antes (bug Norman 30-jul-2026: su domingo 26 quedo con
        // el "1" automatico de cuando estaba activo; tras la baja del 20 la
        // celda se ve "—" pero el valor seguia sumando dias).
        if (emp && dayLockReason(emp, d)) return;
        const v = getVal(eid, d.day);
        if (v === "1" || v === "TF" || v === "DT" || v === "DT2" || v === "INC" || v === "V") {
          present++;
          presentEffective += dayValueFor(emp, d.day, v);
        }
        if (v === "TF") ferTrab++;
        if (v === "DT") domTrab++;
        if (v === "DT2") domTrabTriple++;
        if (v === "INC") incap++;
        if (v === "V") vac++;
        if (v === "0" && !d.isSun && !d.isHoliday) absent++;
      });
      return { present, presentEffective, absent, incap, vac, domTrab, domTrabTriple, ferTrab };
    };

    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="gt-vidrio" style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ font: "800 16px/1.2 var(--display)", color: CHARCOAL }}>{etiquetaCorta(sheet.periodo, sheet.quincena)} · {cc.name}</div>
          <div style={{ fontSize: 12, color: "#6E6862", marginTop: 3 }}>Tocá una celda para cambiarla (1 → 0 → INC → V). Click derecho: otro proyecto u hora de entrada. Domingos y feriados vienen pagados por ley; tocalos si se trabajaron.</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {[["1", "Presente", PAL_CELDA.presente], ["1", "Descanso pagado", PAL_CELDA.descanso], ["0", "NSP", PAL_CELDA.nsp], ["I", "Incapacidad", PAL_CELDA.inc], ["V", "Vacaciones", PAL_CELDA.vac], ["TF · DT · DT2", "Feriado o domingo trabajado", PAL_CELDA.extra], ["1*", "Otro proyecto", PAL_CELDA.presente], ["—", "Bloqueado", PAL_CELDA.bloq]].map(([k, l, c]) => <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "#6E6862" }}><span style={{ minWidth: 22, textAlign: "center", padding: "2px 6px", borderRadius: 6, background: c.bg, color: c.fg, fontWeight: 800, fontSize: 10.5 }}>{k}</span>{l}</span>)}
        </div>
      </div>

      {/* Posibles NSP según GeoClock — el humano confirma el 0 */}
      {nspSugeridos.length > 0 && (
        <div className="gt-vidrio" title="Hubo marcaje en la tablet esos días y estas personas no marcaron entrada. Vos decidís: marcá 0 y corregí a mano si alguien tenía permiso, vacación o andaba en proyecto. Nada se guarda hasta tocar Guardar." style={{ padding: "10px 16px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, boxShadow: "inset 3px 0 0 #E8762D" }}>
          <span style={{ font: "700 13px/1.2 var(--sans)", color: CHARCOAL, whiteSpace: "nowrap" }}>Sin marcaje en GeoClock <span style={{ color: "#A39C92", fontWeight: 600 }}>{nspSugeridos.length}</span></span>
          <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 6, minWidth: 200 }}>
            {nspSugeridos.map(({ e, dias }) => <span key={e.id} style={{ background: "rgba(44,42,40,.06)", borderRadius: 999, padding: "3px 10px", fontSize: 12, color: CHARCOAL }}><b>{e.fullName.split(" ").slice(0, 2).join(" ")}</b> · {dias.join(", ")}</span>)}
          </div>
          {btnH("Marcar 0 (NSP)", aplicarNsp, { c: "#B03024", chico: true })}
        </div>
      )}

      {/* Resumen por proyecto — sin valores monetarios */}
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 8 }}>
          {projGroups.map((proj) => {
            // Resumen simple a pedido del usuario: personas asignadas +
            // inasistencias (NSP) + incapacidades (INC). El costeo de mano
            // de obra por quincena se hara como reporte aparte.
            const pEmps = ae.filter((e) => resolveShortHR(assignments[e.id]) === proj.short);
            let nsp = 0, inc = 0, vac = 0;
            ae.forEach((e) => {
              if (resolveShortHR(assignments[e.id]) !== proj.short) return;
              days.forEach((d) => {
                if (dayLockReason(e, d)) return; // dias fuera de alta/baja no cuentan (fix Norman)
                const v = getVal(e.id, d.day);
                if (v === "0" && !d.isSun && !d.isHoliday) nsp++;
                if (v === "INC") inc++;
                if (v === "V") vac++;
              });
            });
            return (
              <div key={proj.short} className="gt-vidrio" style={{ padding: "11px 14px" }}>
                <div style={{ font: "800 13.5px/1.2 var(--display)", color: CHARCOAL }}>{proj.short}</div>
                <div style={{ fontSize: 11, color: "#A39C92", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{proj.name}</div>
                <div style={{ marginTop: 8, display: "flex", gap: 6, fontSize: 12, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ color: "#6E6862" }}><b style={{ color: CHARCOAL }}>{pEmps.length}</b> persona{pEmps.length !== 1 ? "s" : ""}</span>
                  {nsp > 0 && chipH(`${nsp} NSP`, "rojo")}{inc > 0 && chipH(`${inc} INC`, "ambar")}{vac > 0 && chipH(`${vac} VAC`, "azul")}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {projGroups.map(proj => {
        const pEmps = ae.filter(e => assignments[e.id] === proj.short);
        if (pEmps.length === 0) return null;
        return <div key={proj.short} className="gt-vidrio" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", borderBottom: "1px solid rgba(44,42,40,.07)" }}>
            <span style={{ font: "800 14px/1.2 var(--display)", color: CHARCOAL }}>{proj.short} <span style={{ color: "#A39C92", fontWeight: 600, fontSize: 12.5 }}>{pEmps.length}</span></span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "#A39C92" }}>{proj.code || ""}</span>
              {(() => {
                // Detecta si todas las celdas editables de este proyecto ya tienen valor.
                // Si si → boton en modo "Limpiar". Si no → boton en modo "Marcar completa".
                const allFilled = pEmps.every(e =>
                  days.every(d => dayLockReason(e, d) || !!data[cellKey(e.id, d.day)])
                );
                return (
                  <button onClick={() => {
                    const newData = { ...data };
                    if (allFilled) {
                      // Toggle off: limpiar celdas editables de dias regulares.
                      // Domingos y feriados se mantienen en "1" porque son pagados
                      // por ley (descanso semanal / dia feriado nacional). El usuario
                      // podra cambiarlos a DT/DT2/TF si efectivamente trabajaron.
                      pEmps.forEach(e => days.forEach(d => {
                        if (dayLockReason(e, d)) return;
                        if (d.isSun || d.isHoliday) {
                          newData[cellKey(e.id, d.day)] = "1";
                        } else {
                          delete newData[cellKey(e.id, d.day)];
                        }
                      }));
                    } else {
                      // Toggle on: rellenar las celdas vacias con "1".
                      pEmps.forEach(e => days.forEach(d => {
                        const k = cellKey(e.id, d.day);
                        if (!newData[k] && !dayLockReason(e, d)) newData[k] = "1";
                      }));
                    }
                    setData(newData);
                    setDirty(true);
                  }} style={{ minHeight: 30, padding: "5px 12px", borderRadius: 999, border: allFilled ? "1px solid rgba(192,57,43,.3)" : "1px solid rgba(44,42,40,.14)", background: "rgba(255,255,255,.75)", color: allFilled ? "#B03024" : CHARCOAL, font: "700 12px/1 var(--sans)", cursor: "pointer" }}>
                    {allFilled ? "Limpiar" : "Todos presentes"}
                  </button>
                );
              })()}
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr style={{ background: "rgba(44,42,40,.025)" }}>
                <th style={{ ...TH_H, position: "sticky", left: 0, background: "#FAFAF9", zIndex: 2, minWidth: 170 }}>Colaborador</th>
                {days.map(d => {
                  const bg = "transparent";
                  const labelColor = (d.isHoliday || d.isSun) ? "#A94E16" : "#A39C92";
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
                <th style={{ ...TH_H, textAlign: "center" }}>Días</th>
                <th style={{ ...TH_H, textAlign: "center" }}>DOM</th>
                <th style={{ ...TH_H, textAlign: "center" }}>FER</th>
                <th style={{ ...TH_H, textAlign: "center" }}>NSP</th>
                <th style={{ ...TH_H, textAlign: "center" }}>INC</th>
              </tr></thead>
              <tbody>{pEmps.map(e => {
                const st = empStats(e.id);
                return <tr key={e.id} style={{ borderBottom: "1px solid rgba(44,42,40,.06)" }}>
                  <td style={{ ...TD_H, position: "sticky", left: 0, background: "#FAFAF9", zIndex: 1, fontWeight: 600, fontSize: 11 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span>{e.fullName}</span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600, color: "#A39C92", letterSpacing: 0.5 }}>{genEmpCode(e.fullName, e.dni)}</span>
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
                          style={{ ...TD_H, textAlign: "center", background: PAL_CELDA.bloq.bg, color: PAL_CELDA.bloq.fg, fontWeight: 700, userSelect: "none", minWidth: 32, border: "1px solid rgba(44,42,40,.06)", fontSize: 11, cursor: "not-allowed" }}
                        >
                          —
                        </td>
                      );
                    }
                    const cellTitle = d.isHoliday
                      ? `${d.holidayName}${val === "TF" ? " · TRABAJADO (+2 dias = triple)" : val === "1" ? " · pagado por ley" : ""}`
                      : d.isSun
                      ? `Domingo${val === "DT" ? " · TRABAJADO (+1 dia = doble)" : val === "DT2" ? " · TRABAJADO TRIPLE (+2 dias)" : val === "1" ? " · descanso pagado" : ""}`
                      : ovr
                      ? `Reasignado a ${ovr}. Click derecho para cambiar.`
                      : "Click derecho para reasignar proyecto";
                    return <td key={d.day} style={{ ...TD_H, textAlign: "center", cursor: "pointer", background: cellColor(val, ovr, d), color: cellFontColor(val, d), fontWeight: 700, userSelect: "none", minWidth: 32, border: "1px solid rgba(44,42,40,.06)", position: "relative", fontSize: cellFontSize(val) }}
                      onClick={() => cycle(e.id, d.day)}
                      onContextMenu={(ev) => { ev.preventDefault(); setEditingCell(isEditing ? null : k); }}
                      title={cellTitle}>
                      {cellText(val, ovr) || <span style={{ color: "#D8D4CE" }}>·</span>}
                      {ovr && <div style={{ fontSize: 7, color: "#6E6862", lineHeight: 1 }}>{ovr}</div>}
                      {arrivalTimes[k] && <div style={{ fontSize: 7, color: "#8A5A00", lineHeight: 1, fontWeight: 700, background: "#FBEFC4", borderRadius: 2, marginTop: 1, padding: "0 2px" }}>{arrivalTimes[k]}</div>}
                      {isEditing && <div style={{ position: "absolute", top: "100%", left: 0, background: "#fff", border: "1px solid #CBD5E1", borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,.15)", zIndex: 10, minWidth: 160 }} onClick={ev => ev.stopPropagation()}>
                        <div style={{ padding: "4px 8px", fontSize: 10, color: "#64748b", borderBottom: "1px solid #F1F5F9" }}>Proyecto para este dia:</div>
                        <div style={{ padding: "4px 8px", fontSize: 11, cursor: "pointer", background: !ovr ? "#EFF6FF" : "transparent" }} onClick={() => setOverride(e.id, d.day, null)}>✓ {assignments[e.id]} (base)</div>
                        {hrProjects.filter(p => p.short !== assignments[e.id]).map(p => (
                          <div key={p.short} style={{ padding: "4px 8px", fontSize: 11, cursor: "pointer", background: ovr === p.short ? "#DBEAFE" : "transparent" }} onClick={() => setOverride(e.id, d.day, p.short)}>{ovr === p.short ? "✓ " : ""}{p.short}</div>
                        ))}
                        {(e.payByHour || arrivalTimes[k]) && <>
                          <div style={{ padding: "4px 8px", fontSize: 10, color: "#92400E", borderTop: "1px solid #F1F5F9", borderBottom: "1px solid #F1F5F9", marginTop: 4, background: "#FEF3C7", fontWeight: 700 }}>Hora de entrada (pago proporcional):</div>
                          <div style={{ padding: "4px 8px", fontSize: 11, cursor: "pointer", background: !arrivalTimes[k] ? "#FEF3C7" : "transparent" }} onClick={() => setArrivalTime(e.id, d.day, "")}>{!arrivalTimes[k] ? "✓ " : ""}Sin marcar (paga normal)</div>
                          {ARRIVAL_OPTIONS.map(t => (
                            <div key={t} style={{ padding: "4px 8px", fontSize: 11, cursor: "pointer", background: arrivalTimes[k] === t ? "#FEF3C7" : "transparent" }} onClick={() => setArrivalTime(e.id, d.day, t)}>{arrivalTimes[k] === t ? "✓ " : ""}{t}</div>
                          ))}
                        </>}
                      </div>}
                    </td>;
                  })}
                  <td title={st.presentEffective !== st.present ? `${st.present} dias marcados · ${st.presentEffective.toFixed(2)} dias efectivos (proporcional por hora de entrada)` : `${st.present} dias`} style={{ ...TD_H, textAlign: "center", fontWeight: 700, color: CHARCOAL }}>{st.presentEffective !== st.present ? st.presentEffective.toFixed(2) : st.present}</td>
                  <td title={st.domTrabTriple > 0 ? `${st.domTrab} DT + ${st.domTrabTriple} DT2 (triple)` : `${st.domTrab} DT`} style={{ ...TD_H, textAlign: "center", fontWeight: 700, color: (st.domTrab + st.domTrabTriple) > 0 ? "#A94E16" : "#D8D4CE" }}>{(st.domTrab + st.domTrabTriple) || ""}</td>
                  <td style={{ ...TD_H, textAlign: "center", fontWeight: 700, color: st.ferTrab > 0 ? "#A94E16" : "#D8D4CE" }}>{st.ferTrab || ""}</td>
                  <td style={{ ...TD_H, textAlign: "center", fontWeight: 700, color: st.absent > 0 ? "#B03024" : "#D8D4CE" }}>{st.absent || ""}</td>
                  <td style={{ ...TD_H, textAlign: "center", fontWeight: 700, color: st.incap > 0 ? "#8A5A00" : "#D8D4CE" }}>{st.incap || ""}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        </div>;
      })}
      {dirty && <div className="gt-vidrio" style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: CHARCOAL }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: ORANGE }} /><b>Tenés cambios sin guardar.</b> Tocá Guardar asistencia antes de cerrar.</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button type="button" className="gt-btn" onClick={() => {
          if (dirty) {
            const ok = confirm(
              "Tenés cambios SIN GUARDAR.\n\n" +
              "Si cerrás sin guardar, los cambios se van a perder.\n\n" +
              "¿Estás seguro de que querés cerrar sin guardar?"
            );
            if (!ok) return;
          }
          attDraftRef.current = null; // descarte explicito del respaldo
          setModal(null);
        }}>Cerrar</button>
        {btnH("Exportar PDF", () => exportAttendancePDF())}
        <button type="button" className="gt-btn gt-btn-primario" onClick={async () => {
          if (attSavingRef.current) return; // anti doble-clic
          attSavingRef.current = true;
          try {
            // GUARDIA anti-vaciado: si la hoja TENIA celdas marcadas y ahora
            // va sin ninguna, pedir confirmacion explicita.
            const llenasNuevas = Object.values(data).filter(Boolean).length;
            const llenasViejas = Object.values(sheet.grid || {}).filter(Boolean).length;
            if (llenasNuevas === 0 && llenasViejas > 0) {
              if (!confirm(`⚠️ ATENCIÓN: estás por guardar la asistencia ${sheet.quincena} ${sheet.periodo} SIN NINGUNA celda marcada.\n\nLa hoja tenía ${llenasViejas} celda(s) que se BORRARÍAN.\n\n¿Seguro?`)) return;
            }
            const record = { ...sheet, grid: data, projOverrides: overrides, arrivalTimes, lastSaved: new Date().toISOString() };
            // MERGE por hoja contra la NUBE (lectura DIRECTA getCloud, sin
            // cache local viejo): union nube + memoria conservando la version
            // MAS RECIENTE de cada hoja (company|periodo|quincena) — asi una
            // pestana desactualizada NUNCA pisa la asistencia de la otra
            // empresa u otra quincena (asi se perdio Subterra el 30-jul).
            let cloudArr = null;
            try { const c = await store.getCloud("hr-atts2"); if (Array.isArray(c)) cloudArr = c; } catch { cloudArr = null; }
            const keyOf = a => `${a.company}|${a.periodo}|${a.quincena}`;
            const byKey = {};
            [...(Array.isArray(atts) ? atts : []), ...(cloudArr || [])].forEach(a => {
              if (!a || !a.id) return;
              const kk = keyOf(a);
              const cur = byKey[kk];
              if (!cur || String(a.lastSaved || a.date || "") > String(cur.lastSaved || cur.date || "")) byKey[kk] = a;
            });
            // RE-APLICAR tardanzas DENEGADAS (GeoClock) antes de subir: si
            // otro usuario denegó una tardanza mientras esta hoja estaba
            // ABIERTA, el arrivalTimes local no la tiene y este guardado la
            // pisaría en silencio (se perdería el descuento). gc-tardies es
            // la fuente de verdad — se relee de la nube y se re-fija toda
            // hora denegada de esta quincena que falte en la hoja.
            try {
              record.arrivalTimes = { ...(record.arrivalTimes || {}) }; // clon: no mutar el estado de React
              const tds = await store.getCloud("gc-tardies").catch(() => gcTardies);
              (Array.isArray(tds) ? tds : gcTardies || []).forEach(dec => {
                if (!dec || dec.estado !== "denegada" || !dec.horaAplicada || !dec.fecha) return;
                const dStr = String(dec.fecha).slice(0, 10);
                if (dStr.slice(0, 7) !== record.periodo) return;
                const dd = Number(dStr.slice(8, 10));
                const enQ = record.quincena === "1Q" ? dd >= 1 && dd <= 15 : dd >= 16;
                if (!enQ) return;
                const emp = ae.find(x => x.id === dec.empId);
                if (!emp || emp.company !== record.company) return;
                const kk2 = `${dec.empId}-${dd}`;
                if (!record.arrivalTimes[kk2]) record.arrivalTimes[kk2] = dec.horaAplicada;
              });
            } catch { /* mejor esfuerzo: initialArrivals re-siembra al reabrir */ }
            byKey[keyOf(record)] = record;
            const updated = Object.values(byKey);
            setAtts(updated);
            const ok = await store.set("hr-atts2", updated);
            if (!ok) {
              alert("⚠️ La asistencia se guardó en este dispositivo pero NO se sincronizó a la nube.\n\nRevisá tu conexión y volvé a tocar Guardar. El modal queda abierto.");
              return;
            }
            // VERIFICAR con lectura DIRECTA a la nube: la hoja debe estar con
            // ESTE lastSaved y la misma cantidad de celdas marcadas.
            let verified = false;
            try {
              const back = await store.getCloud("hr-atts2");
              const mine = Array.isArray(back) ? back.find(a => a.id === record.id) : null;
              verified = !!mine && mine.lastSaved === record.lastSaved && Object.values(mine.grid || {}).filter(Boolean).length === llenasNuevas;
            } catch { verified = false; }
            if (!verified) {
              alert("⚠️ El guardado NO se pudo VERIFICAR en la nube.\n\nNO cierres la hoja: revisá tu conexión y tocá Guardar de nuevo.");
              return;
            }
            attDraftRef.current = null;
            alert(`✅ Asistencia ${sheet.quincena} ${sheet.periodo} guardada y VERIFICADA en la nube.\n\n${llenasNuevas} celda(s) marcadas.`);
            setDirty(false);
            setModal(null);
          } finally {
            attSavingRef.current = false;
          }
        }}>Guardar asistencia</button>
      </div>
    </div>;

    function exportAttendancePDF() {
      const w = window.open("", "_blank");
      if (!w) { alert("Permite popups para imprimir"); return; }

      // Resumen simple (igual que en pantalla): personas asignadas + NSP +
      // INC por proyecto. El costeo de mano de obra es reporte aparte.
      const summary = projGroups.map((proj) => {
        const pEmps = ae.filter((e) => resolveShortHR(assignments[e.id]) === proj.short);
        let nsp = 0, inc = 0;
        ae.forEach((e) => {
          if (resolveShortHR(assignments[e.id]) !== proj.short) return;
          days.forEach((d) => {
            if (dayLockReason(e, d)) return; // dias fuera de alta/baja no cuentan
            const v = getVal(e.id, d.day);
            if (v === "0" && !d.isSun && !d.isHoliday) nsp++;
            if (v === "INC") inc++;
          });
        });
        return { proj, pEmps, nsp, inc };
      });

      // ── RESUMEN PARA PLANILLA (al final del reporte) ──
      // Como las hojas de Excel que se armaban a mano (ausencias sin goce,
      // incapacidades, vacaciones) pero automatico: quien, que dias y total.
      const resumenDe = (estado) => {
        const out = [];
        ae.forEach((e) => {
          const diasE = [];
          days.forEach((d) => {
            if (dayLockReason(e, d)) return;
            const v = getVal(e.id, d.day);
            if (estado === "NSP") { if (v === "0" && !d.isSun && !d.isHoliday) diasE.push(d.day); }
            else if (v === estado) diasE.push(d.day);
          });
          if (diasE.length) out.push({ e, dias: diasE, proj: resolveShortHR(assignments[e.id]) || "—" });
        });
        return out.sort((a, b) => b.dias.length - a.dias.length);
      };
      const rNsp = resumenDe("NSP"), rInc = resumenDe("INC"), rVac = resumenDe("V");
      const resumenSection = (titulo, color, rows, vacio) => rSeccion(titulo,
        rows.length ? rTabla({
          columnas: [{ t: "Colaborador" }, { t: "Proyecto", ancho: "130px" }, { t: "Días (del mes)" }, { t: "Total", num: true, ancho: "60px" }],
          filas: rows.map((r) => [
            `<b>${escHTML(r.e.fullName)}</b> <span class="mono" style="color:${RP.texto3};font-size:8.5px">${escHTML(genEmpCode(r.e.fullName, r.e.dni))}</span>`,
            `<span class="mono suave">${escHTML(r.proj)}</span>`,
            `<span class="mono">${r.dias.join(", ")}</span>`,
            `<b style="color:${color}">${r.dias.length}</b>`,
          ]),
        }) : `<div class="rp-nota">${vacio}</div>`,
        rows.length ? `${rows.length} colaborador${rows.length !== 1 ? "es" : ""}` : "");
      const resumenPlanillaHtml = `<div class="rp-salto"></div>
        <div class="rp-titulo" style="font-size:20px">Resumen para planilla</div>
        <div class="rp-sub">${escHTML(cc.name)} · ${escHTML(sheet.quincena)} ${escHTML(sheet.periodo)} — detalle de deducciones y días especiales</div>
        <div class="rp-acento"></div>
        ${resumenSection("Ausencias sin goce de sueldo (NSP)", PAL_CELDA.nsp.fg, rNsp, "Sin ausencias esta quincena — asistencia completa.")}
        ${resumenSection("Incapacidades", PAL_CELDA.inc.fg, rInc, "Sin incapacidades esta quincena.")}
        ${resumenSection("Vacaciones", PAL_CELDA.vac.fg, rVac, "Sin vacaciones esta quincena.")}`;

      // ── Color PASTEL por proyecto (29-oct-2026, Gerson: "cada proyecto es un
      // color, pasteles bonitos"): tiñe la cabecera de cada proyecto, su
      // pastilla en el resumen y las celdas "1*" (días trabajados en OTRO
      // proyecto). Sin rojos ni rosados, que se leerían como NSP. Cubre
      // proyectos que solo aparecen vía override.
      const projColor = {};
      let pcDe = {};
      {
        const shorts = [];
        projGroups.forEach((p) => { if (!shorts.includes(p.short)) shorts.push(p.short); });
        ae.forEach((e) => days.forEach((d) => {
          const o = getProj(e.id, d.day);
          const s = o ? resolveShortHR(o) : null;
          if (s && !shorts.includes(s)) shorts.push(s);
        }));
        pcDe = pastelesDe(shorts);
        shorts.forEach((s) => { projColor[s] = pcDe[s].base; });
      }

      const dayHeaderHtml = days
        .map((d) => {
          const esp = d.isHoliday || d.isSun;
          return `<th class="d" style="${esp ? `background:${RP.fondo};` : ""}"><div style="color:${esp ? RP.naranjaTexto : RP.texto3};font-size:6.5px">${d.isHoliday ? "F" : d.dow}</div><div style="color:${RP.carbon}">${d.day}</div></th>`;
        })
        .join("");

      const celda = (bg, fg, txt, extra = "") => `<td class="d" style="background:${bg};color:${fg};${extra}">${txt}</td>`;
      const projTablesHtml = projGroups
        .map((proj) => {
          const pEmps = ae.filter((e) => resolveShortHR(assignments[e.id]) === proj.short);
          if (pEmps.length === 0) return "";
          const rows = pEmps
            .map((e) => {
              const st = empStats(e.id);
              const code = genEmpCode(e.fullName, e.dni);
              const cells = days
                .map((d) => {
                  if (dayLockReason(e, d)) return celda(PAL_CELDA.bloq.bg, PAL_CELDA.bloq.fg, "—");
                  const v = getVal(e.id, d.day);
                  const ovr = getProj(e.id, d.day);
                  const opc = ovr ? pcDe[resolveShortHR(ovr)] : null;
                  const oc = opc ? opc.base : null;
                  const st2 = ovr ? "*" : "";
                  let p = null, txt = "·";
                  if (v === "TF") { p = PAL_CELDA.extra; txt = "TF" + st2; }
                  else if (v === "DT") { p = PAL_CELDA.extra; txt = "DT" + st2; }
                  else if (v === "DT2") { p = PAL_CELDA.extra; txt = "DT2" + st2; }
                  else if (v === "1") { p = (d.isHoliday || d.isSun) ? PAL_CELDA.descanso : null; txt = "1" + st2; }
                  else if (v === "0") { p = PAL_CELDA.nsp; txt = "0"; }
                  else if (v === "INC") { p = PAL_CELDA.inc; txt = "I" + st2; }
                  else if (v === "V") { p = PAL_CELDA.vac; txt = "V" + st2; }
                  let bg = p ? p.bg : "transparent";
                  let fg = p ? p.fg : (v === "1" ? RP.carbon : RP.lineaFuerte);
                  // Trabajó ese día en OTRO proyecto: tinte suave del color de
                  // ese proyecto + rayita abajo, para leerlo de un vistazo.
                  let extra = "";
                  if (oc && v && v !== "0") { bg = opc.bg; fg = opc.tinta; extra = `box-shadow:inset 0 -2px 0 ${oc};`; }
                  const arr = arrivalTimes[`${e.id}-${d.day}`];
                  const arrivalHtml = arr ? `<div class="mono" style="font-size:5.5px;color:${RP.naranjaTexto};line-height:1;margin-top:1px">${arr}</div>` : "";
                  return celda(bg, fg, txt + arrivalHtml, extra);
                })
                .join("");
              const dom = st.domTrab + st.domTrabTriple;
              return `<tr>
                <td class="n"><b>${escHTML(e.fullName)}</b><br><span class="mono" style="color:${RP.texto3};font-size:7.5px">${escHTML(code)}</span></td>
                ${cells}
                <td class="t" style="color:${RP.verde}" title="${st.presentEffective !== st.present ? `${st.present} marcados · ${st.presentEffective.toFixed(2)} efectivos` : ""}">${st.presentEffective !== st.present ? st.presentEffective.toFixed(2) : st.present}</td>
                <td class="t" style="color:${PAL_CELDA.extra.fg}">${dom || ""}</td>
                <td class="t" style="color:${PAL_CELDA.extra.fg}">${st.ferTrab || ""}</td>
                <td class="t" style="color:${PAL_CELDA.nsp.fg}">${st.absent || ""}</td>
                <td class="t" style="color:${PAL_CELDA.inc.fg}">${st.incap || ""}</td>
              </tr>`;
            })
            .join("");
          // Cortes de pagina: nunca partir un proyecto entre paginas — la
          // seccion (.rp-sec) no se corta: si no cabe, pasa entera a la
          // siguiente hoja.
          return `<div>${rSeccionProyecto(pcDe[proj.short], `${proj.short} · ${proj.name}`,
            `<table class="asis"><thead><tr>
                <th class="n">Colaborador</th>${dayHeaderHtml}
                <th class="t">Días</th><th class="t">Dom</th><th class="t">Fer</th><th class="t">NSP</th><th class="t">INC</th>
              </tr></thead><tbody>${rows}</tbody></table>`,
            `<span class="mono">${escHTML(proj.code || "")}</span> · ${pEmps.length} persona${pEmps.length !== 1 ? "s" : ""}`)}</div>`;
        })
        .join("");

      const conGente = summary.filter((s) => s.pEmps.length > 0);
      const totPersonas = summary.reduce((s, x) => s + x.pEmps.length, 0);
      const totNSP = summary.reduce((s, x) => s + x.nsp, 0);
      const totINC = summary.reduce((s, x) => s + x.inc, 0);
      const resumenProyHtml = rTabla({
        columnas: [{ t: "Proyecto" }, { t: "Personas", num: true, ancho: "80px" }, { t: "NSP", num: true, ancho: "70px" }, { t: "INC", num: true, ancho: "70px" }],
        filas: conGente.map((s) => [
          `${rProyecto(pcDe[s.proj.short], s.proj.short)} <span class="suave">${escHTML(s.proj.name)}</span>`,
          s.pEmps.length,
          s.nsp > 0 ? `<b style="color:${PAL_CELDA.nsp.fg}">${s.nsp}</b>` : `<span style="color:${RP.texto3}">0</span>`,
          s.inc > 0 ? `<b style="color:${PAL_CELDA.inc.fg}">${s.inc}</b>` : `<span style="color:${RP.texto3}">0</span>`,
        ]),
      });
      const chipCelda = (p, cod, txt) => `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:10px;white-space:nowrap"><span class="mono" style="background:${p ? p.bg : "#fff"};color:${p ? p.fg : RP.carbon};border:${p ? "none" : `1px solid ${RP.linea}`};border-radius:4px;padding:0 5px;font-weight:700">${cod}</span>${txt}</span>`;
      const leyendaHtml = `<div style="break-inside:avoid;page-break-inside:avoid"><div class="rp-nota" style="line-height:2">
          ${chipCelda(null, "1", "Presente")}${chipCelda(PAL_CELDA.descanso, "1", "domingo/feriado = descanso pagado")}${chipCelda(PAL_CELDA.nsp, "0", "NSP")}${chipCelda(PAL_CELDA.inc, "I", "Incapacidad")}${chipCelda(PAL_CELDA.vac, "V", "Vacaciones")}${chipCelda(PAL_CELDA.extra, "TF", "Feriado trabajado (×3)")}${chipCelda(PAL_CELDA.extra, "DT", "Domingo trabajado (×2)")}${chipCelda(PAL_CELDA.extra, "DT2", "Domingo triple (×3)")}${chipCelda(PAL_CELDA.bloq, "—", "bloqueado por alta/baja")}
        </div>
        <div class="rp-nota" style="line-height:2.2"><b>*</b> = ese día trabajó en otro proyecto (celda con el color de ese proyecto):
          ${Object.keys(projColor).map((s) => rProyecto(pcDe[s], s)).join(" ")}
        </div></div>`;

      const cuerpo = `<style>
          table.asis{width:100%;border-collapse:collapse;font-size:9px;table-layout:fixed}
          .asis th.n{width:205px}.asis th.t{width:40px}
          .asis th{font-size:7.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${RP.texto3};padding:4px 2px;border-bottom:1px solid ${RP.lineaFuerte};text-align:center}
          .asis th.n{text-align:left;padding-left:6px}
          .asis td{border-bottom:1px solid ${RP.linea};padding:3px 2px}
          .asis td.d{text-align:center;font-weight:700;font-family:'IBM Plex Mono',ui-monospace,Menlo,monospace;font-size:8.5px;border-left:1px solid #fff}
          .asis td.n{padding:4px 6px;font-size:9.5px}
          .asis td.t,.asis th.t{text-align:center;font-weight:700;font-family:'IBM Plex Mono',ui-monospace,Menlo,monospace;padding:3px 5px}
        </style>`
        + rKpis([
          { label: "Personas asignadas", valor: totPersonas },
          { label: "Proyectos", valor: conGente.length },
          { label: "Inasistencias (NSP)", valor: totNSP, tono: totNSP > 0 ? "rojo" : undefined },
          { label: "Incapacidades", valor: totINC, tono: totINC > 0 ? PAL_CELDA.inc.fg : undefined },
        ])
        + rSeccion("Resumen por proyecto", resumenProyHtml)
        + leyendaHtml
        + `<div style="height:14px"></div>`
        + projTablesHtml
        + resumenPlanillaHtml;
      abrirReporte(w, reporteHTML({ titulo: "Reporte de asistencia", subtitulo: `${cc.name} · Quincena ${sheet.quincena} ${sheet.periodo}`, empresa: sheet.company || co, cuerpo, horizontal: true }));
    };
  };

  const ConForm = () => { const [eid, setEid] = useState(""); const [tp, setTp] = useState("laboral"); const emp = emps.find(e => e.id === eid); const today = new Date().toLocaleDateString("es-HN", { day: "numeric", month: "long", year: "numeric" }); const txt = emp ? (tp === "laboral" ? `CONSTANCIA LABORAL\n\nHacemos constar que ${emp.fullName}, identidad ${emp.dni}, labora para ${COMPANIES[emp.company].name}, cargo: ${emp.position}, desde ${fmt(emp.startDate)} a la fecha.\n\nSan Pedro Sula, ${today}.\n\nGerson Steve Trochez Cubas\nRecursos Humanos` : `CONSTANCIA DE INGRESOS\n\nHacemos constar que ${emp.fullName}, identidad ${emp.dni}, labora para ${COMPANIES[emp.company].name}, cargo: ${emp.position}, salario mensual: ${fmtL(emp.salary)}.\n\nSan Pedro Sula, ${today}.\n\nGerson Steve Trochez Cubas\nRecursos Humanos`) : ""; return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}><Select label="Empleado" options={ae.map(e => ({ value: e.id, label: e.fullName }))} value={eid} onChange={e => setEid(e.target.value)} /><Select label="Tipo" options={hideSalary ? [{ value: "laboral", label: "Laboral" }] : [{ value: "laboral", label: "Laboral" }, { value: "ingresos", label: "Ingresos" }]} value={tp} onChange={e => setTp(e.target.value)} /></div>{txt && <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: 18 }}><pre style={{ whiteSpace: "pre-wrap", fontFamily: "'Segoe UI'", fontSize: 13, lineHeight: 1.7, margin: 0 }}>{txt}</pre></div>}<div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}><Btn variant="ghost" onClick={() => setModal(null)}>Cerrar</Btn>{txt && <Btn variant="success" onClick={() => { sC([...cons, { id: uid(), employeeId: eid, type: tp, date: new Date().toISOString(), text: txt }]); navigator.clipboard?.writeText(txt); alert("Copiado"); setModal(null); }}>Copiar y guardar</Btn>}</div></div>; };

  // ═══════════════════════════════════════════════════════════════════
  // HUB DE RRHH (20-oct-2026): guardado de solicitudes + decisiones
  // ═══════════════════════════════════════════════════════════════════
  const hubUser = { username: userKey, nombre: userName, rol: userRole, empId: null };
  const vinculoYo = vincularEmpleado({ username: userKey, label: userName, empId: userEmpId }, emps, vinculos);
  const yo = vinculoYo.emp;
  hubUser.empId = yo?.id || null;
  const fotoDe = (e) => e?.photo?.fileId ? photoCache[e.photo.fileId] || null : null;
  const leerMarcas = (periodo, quincena) => store.getCloud(gcMarkKey(periodo, quincena)).then(a => Array.isArray(a) ? a : []).catch(() => []);
  // La bandeja se escribe SIEMPRE sobre la lista fresca de la nube
  // (getCloud → fn → set → verify por ids). Si la nube no responde, no se guarda.
  const sSol = async (fn) => {
    let cloud;
    try { cloud = await store.getCloud(KEY_SOLICITUDES); } catch { alert("No se pudo leer la nube. Revisá tu conexión y volvé a intentar."); return false; }
    const base = Array.isArray(cloud) ? cloud : [];
    const next = fn(base);
    if (!next) return false;
    const ok = await store.set(KEY_SOLICITUDES, next);
    if (!ok) { alert("No se pudo guardar en la nube."); return false; }
    try { const back = await store.getCloud(KEY_SOLICITUDES); const ids = new Set((Array.isArray(back) ? back : []).map(x => x.id)); if (!next.every(x => ids.has(x.id))) { alert("La nube no confirmó el guardado. Recargá y revisá."); return false; } setSolicitudes(Array.isArray(back) ? back : next); }
    catch { setSolicitudes(next); }
    return true;
  };
  // Agrega registros a una key de lista (hr-vacs / hr-lvs / hr-cons) contra la nube.
  const anexarEn = async (key, items, setter) => {
    let cloud;
    try { cloud = await store.getCloud(key); } catch { alert("No se pudo leer la nube para registrar. No se guardó nada."); return false; }
    const next = [...(Array.isArray(cloud) ? cloud : []), ...items];
    const ok = await store.set(key, next);
    if (!ok) { alert("No se pudo guardar en la nube."); return false; }
    setter(next);
    return true;
  };
  const crearSolicitud = async (s) => {
    const anio = Number(hoyISO().slice(0, 4));
    return sSol(list => [...list, { ...s, id: uid(), folio: siguienteFolio(list, anio) }]);
  };
  const cancelarSolicitud = (sol) => sSol(list => list.map(x => x.id === sol.id && x.estado === "pendiente" ? { ...x, estado: "cancelada", updatedAt: new Date().toISOString(), historial: [...(x.historial || []), { accion: "cancelada", por: userName, at: new Date().toISOString() }] } : x));
  const vincularUsuario = async (empId) => {
    let cloud; try { cloud = await store.getCloud(KEY_VINCULOS); } catch { alert("No se pudo leer la nube."); return false; }
    const next = { ...(cloud && typeof cloud === "object" && !Array.isArray(cloud) ? cloud : {}), [userKey]: empId };
    const ok = await store.set(KEY_VINCULOS, next); if (!ok) { alert("No se pudo guardar."); return false; }
    setVinculos(next); return true;
  };
  const decidirSolicitud = async (sol, accion, { motivo = "" } = {}) => {
    const at = new Date().toISOString(), por = userName;
    const emp = emps.find(e => e.id === sol.empId);
    let patch = {}, label = accion;
    if (accion === "aprobar") {
      if (!emp) { alert("La ficha de esta persona ya no existe en GeoTeam."); return false; }
      if (sol.tipo === "vacaciones") {
        const v = vacacionDeSolicitud(sol, { id: uid(), aprobadoPor: por, at });
        if (!(await anexarEn("hr-vacs", [v], setVacs))) return false;
        await syncVacacion(v, null);
        patch = { estado: "aprobada", resultado: { vacId: v.id, at } };
      } else if (sol.tipo === "permiso") {
        const ls = permisosDeSolicitud(sol, { idDe: () => uid(), aprobadoPor: por, at });
        if (!(await anexarEn("hr-lvs", ls, setLvs))) return false;
        if (ls.length === 1) await syncPermiso(ls[0], null);
        else { const r = await marcarEnAsistencia(sol.empId, sol.fecha, sol.hasta, valorPermiso(ls[0]), "aplicar"); if (r.sinNube) alert("El permiso quedó registrado pero NO se marcó en la asistencia (sin nube)."); else if (r.celdas) alert(`✅ ${r.celdas} día(s) marcados en la asistencia (${r.hojas.join(", ")})`); }
        patch = { estado: "aprobada", resultado: { lvIds: ls.map(l => l.id), at } };
      } else if (sol.tipo === "constancia") {
        const tipo = sol.tipoConstancia === "trabajo" ? "trabajo" : "laboral";
        const doc = constanciaDoc(emp, { tipo, hoy: hoyISO() });
        const c = { id: uid(), employeeId: emp.id, type: tipo, date: at, text: textoConstancia(emp, { tipo, hoy: hoyISO() }), origenSolicitud: sol.id, emitidaPor: por };
        await anexarEn("hr-cons", [c], setCons);
        patch = { estado: "aprobada", resultado: { doc, consId: c.id, at } };
      } else return false;
      label = "aprobada";
    } else if (accion === "denegar") { patch = { estado: "denegada" }; label = "denegada"; }
    else if (accion === "revision") { patch = { estado: "en_revision" }; label = "en revisión"; }
    else if (accion === "resolver") { patch = { estado: "resuelta" }; label = "resuelta"; }
    else return false;
    return sSol(list => list.map(x => x.id === sol.id ? { ...x, ...patch, decision: { por, at, motivo }, updatedAt: at, historial: [...(x.historial || []), { accion: label, por, at, nota: motivo }] } : x));
  };
  const renderMiRRHH = () => <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    {solicitudesErr && <div style={{ background: "rgba(192,57,43,.07)", borderRadius: 14, padding: "10px 14px", fontSize: 12.5, color: "#B03024" }}>{solicitudesErr}</div>}
    <PortalRRHH user={hubUser} yo={yo} vinculoEstado={vinculoYo.como} emps={emps} vacs={vacs} lvs={lvs} cons={cons} solicitudes={solicitudes} fotoDe={fotoDe} gcTardies={gcTardies} leerMarcas={leerMarcas}
      onNueva={(tipo) => setHubModal({ t: "nueva", tipo })} onAbrir={(s) => setHubModal({ t: "ver", id: s.id })} onVincular={vincularUsuario} />
  </div>;
  const renderSolicitudesHub = () => {
    if (solSub) return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}><button type="button" className="gt-circulo" onClick={() => setSolSub("")} aria-label="Atrás" style={{ width: 34, height: 34, fontSize: 15 }}>←</button><div style={{ font: "800 18px/1.2 var(--display)", color: CHARCOAL }}>{solSub === "vacations" ? "Registro de vacaciones" : solSub === "leaves" ? "Registro de permisos" : "Constancias emitidas"}</div><span style={{ fontSize: 12.5, color: "#6E6862" }}>{cc.name}</span></div>
      {solSub === "vacations" ? renderVacs() : solSub === "leaves" ? renderLvs() : renderCons()}
    </div>;
    const caja = (titulo, n, sub, id) => <div key={id} className="gt-vidrio gt-vidrio-hover" role="button" tabIndex={0} onClick={() => setSolSub(id)} onKeyDown={e => { if (e.key === "Enter") setSolSub(id); }} style={{ padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ flex: 1 }}><div style={{ font: "800 14.5px/1.2 var(--display)", color: CHARCOAL }}>{titulo}</div><div style={{ fontSize: 12, color: "#6E6862", marginTop: 3 }}>{sub}</div></div>
      <div style={{ font: "800 22px/1 var(--display)", color: CHARCOAL }}>{n}</div><span style={{ color: "#A39C92" }}>›</span>
    </div>;
    const anio = hoyISO().slice(0, 4);
    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {solicitudesErr && <div style={{ background: "rgba(192,57,43,.07)", borderRadius: 14, padding: "10px 14px", fontSize: 12.5, color: "#B03024" }}>{solicitudesErr}</div>}
      <BandejaRRHH user={hubUser} emps={emps} solicitudes={solicitudes} fotoDe={fotoDe} co={co} onAbrir={(s) => setHubModal({ t: "ver", id: s.id })} onNueva={(tipo) => setHubModal({ t: "nueva", tipo })} />
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "6px 2px 10px" }}><span style={{ font: "800 16px/1 var(--display)", color: CHARCOAL }}>Registros</span><span style={{ font: "600 13px/1 var(--sans)", color: "#A39C92" }}>{cc.name} · lo aprobado y lo cargado a mano</span></div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0,1fr))", gap: 10 }}>
          {caja("Vacaciones", cv.filter(v => String(v.startDate || "").startsWith(anio)).length, `registradas en ${anio} · marcan "V" en la asistencia`, "vacations")}
          {caja("Permisos", cl.filter(l => String(l.date || "").startsWith(anio)).length, `en ${anio} · con o sin goce`, "leaves")}
          {caja("Constancias", cc2.filter(c => String(c.date || "").startsWith(anio)).length, `emitidas en ${anio}`, "constancias")}
        </div>
      </div>
    </div>;
  };
  const renderModalHub = () => {
    if (!hubModal) return null;
    if (hubModal.t === "nueva") return <ModalHub title="Nueva solicitud" onClose={() => setHubModal(null)}>
      <SolicitudFormImpl tipoInicial={hubModal.tipo} emps={emps} yo={yo} user={hubUser} vacs={vacs} fotoDe={fotoDe} onGuardar={crearSolicitud} onClose={() => setHubModal(null)} />
    </ModalHub>;
    const sol = solicitudes.find(x => x.id === hubModal.id);
    if (!sol) return null;
    const empSol = emps.find(e => e.id === sol.empId);
    const vistaPrevia = sol.tipo === "constancia" && empSol && estaAbierta(sol) && (sol.tipoConstancia !== "trabajo" || !hideSalary) ? constanciaDoc(empSol, { tipo: sol.tipoConstancia === "trabajo" ? "trabajo" : "laboral", hoy: hoyISO() }) : null;
    return <ModalHub title={`${sol.folio || "Solicitud"}`} onClose={() => setHubModal(null)} wide={sol.tipo === "constancia"}>
      <SolicitudDetalleImpl sol={sol} user={hubUser} emps={emps} fotoDe={fotoDe} hoy={hoyISO()} vistaPrevia={vistaPrevia} onDecidir={decidirSolicitud} onCancelar={cancelarSolicitud} onClose={() => setHubModal(null)} />
    </ModalHub>;
  };

  // ── SECTIONS ──
  // ── HORAS EXTRAS ──
  // Bandas fijas de la empresa (jornada 7am-4pm):
  //   b1 = 4pm-7pm  → +25% (hora × 1.25)
  //   b2 = 7pm-10pm → +50% (hora × 1.50)
  //   b3 = 10pm-12am→ +75% (hora × 1.75)
  //   DOMINGO: todas las bandas ×2 (+100%).
  // Hora base = salario base ÷ 30 ÷ 8 (SIN bonificacion — regla de la empresa).
  // Pago quincena vencida: HE de 1Q se pagan a fin de mes (planilla 2Q);
  // HE de 2Q se pagan el 15 del mes siguiente (planilla 1Q).
  const HE_BANDAS = [
    { k: "b1", label: "4-7", mult: 1.25, bg: "#F3F2EF", fg: "#6E6862" },
    { k: "b2", label: "7-10", mult: 1.50, bg: "#ECEAE6", fg: "#6E6862" },
    { k: "b3", label: "10-12", mult: 1.75, bg: "#E5E2DC", fg: "#6E6862" },
  ];
  const heNum = (x) => { const n = parseFloat(String(x ?? "").replace(",", ".")); return isNaN(n) ? 0 : n; };
  const heMult = (isSun, band) => isSun ? 2 : band.mult;
  // Salario base para HE: el ajuste especial (heSalBase) GANA sobre el salario
  // real. Asi se refleja en el grid, en el PDF y en Costos (calcCostoMO).
  const heSalarioBase = (e) => { const ov = heSalBase[e.id]; return (ov != null && ov !== "" && !isNaN(Number(ov)) && Number(ov) > 0) ? Number(ov) : (Number(e.salary) || 0); };
  const heHoraBase = (e) => heSalarioBase(e) / 30 / 8;
  const heDiasQ = (periodo, quincena) => {
    const [y, m] = (periodo || "").split("-").map(Number);
    if (!y || !m) return [];
    const start = quincena === "1Q" ? 1 : 16;
    const end = quincena === "1Q" ? 15 : new Date(y, m, 0).getDate();
    const out = [];
    for (let d = start; d <= end; d++) {
      const dt = new Date(y, m - 1, d);
      out.push({ day: d, dow: DAYS_ES[dt.getDay()], isSun: dt.getDay() === 0, isSat: dt.getDay() === 6, isHoliday: esFeriadoQuincena(periodo, d) });
    }
    return out;
  };
  const hePagoLabel = (quincena) => quincena === "1Q"
    ? "se pagan a FIN DE ESTE MES (planilla 2Q)"
    : "se pagan el 15 DEL MES SIGUIENTE (planilla 1Q)";
  // Total de horas y costo de una hoja HE completa (para listados y Costos).
  const heTotalsOf = (rec) => {
    const dias = heDiasQ(rec.periodo, rec.quincena);
    const sunSet = new Set(dias.filter(d => d.isSun).map(d => d.day));
    let hrs = 0, costo = 0;
    Object.entries(rec.hours || {}).forEach(([k, c]) => {
      const day = Number(k.split("-").pop());
      const eid = k.slice(0, k.lastIndexOf("-"));
      const emp = emps.find(e => e.id === eid);
      if (!emp) return;
      const hb = heHoraBase(emp);
      HE_BANDAS.forEach(b => {
        const h = heNum(c[b.k]);
        if (h <= 0) return;
        hrs += h;
        costo += h * heMult(sunSet.has(day), b) * hb;
      });
    });
    return { hrs, costo };
  };

  const HorasExtrasGrid = ({ sheet }) => {
    // Si hay un respaldo vivo de ESTA hoja CON CAMBIOS (remount del padre a
    // mitad de digitacion), se restaura — lo digitado no se pierde por un
    // re-render. Drafts sin cambios (dirty=false) se descartan: la hoja que
    // llega por props es la fuente de verdad. El respaldo NUNCA sobrevive al
    // cierre del modal (Cerrar, ×, backdrop y guardar lo limpian).
    const draftKey = `${sheet.company}|${sheet.periodo}|${sheet.quincena}`;
    const draft = heDraftRef.current && heDraftRef.current.key === draftKey && heDraftRef.current.dirty ? heDraftRef.current : null;
    // hours en edicion: strings (acepta "1.5" y "1,5"); se normaliza al guardar.
    const [hours, setHours] = useState(() => {
      if (draft) return draft.hours;
      const h = {};
      Object.entries(sheet.hours || {}).forEach(([k, c]) => { h[k] = { b1: c.b1 ? String(c.b1) : "", b2: c.b2 ? String(c.b2) : "", b3: c.b3 ? String(c.b3) : "" }; });
      return h;
    });
    const [dirty, setDirty] = useState(draft ? draft.dirty : false);
    // Overrides por dia: { "empId-dia": "SHORT" } — si el colaborador hizo
    // HE para OTRO proyecto ese dia, el costo se carga a ese proyecto
    // (mismo concepto que el "1*" de asistencia). Click derecho para asignar.
    const [projOvr, setProjOvr] = useState(() => draft ? draft.projOvr : (sheet.projOverrides || {}));
    const [editingCell, setEditingCell] = useState(null);
    // Ajuste de salario base para HE (casos especiales). Copia LOCAL del mapa
    // global — se edita aca y se persiste junto con "Guardar horas extras"
    // (guardar el mapa global a mitad de edicion remontaria la grid y
    // perderia lo digitado). hbOf usa esta copia local para el preview vivo.
    const [salBaseEdits, setSalBaseEdits] = useState(() => draft ? draft.salBaseEdits : ({ ...heSalBase }));
    // Mapa base sobre el que se hicieron las ediciones de salario — al
    // guardar solo se aplican los empIds que el usuario CAMBIO respecto a
    // este seed (no se pisan ajustes concurrentes que esta sesion nunca vio).
    const [salBaseSeed] = useState(() => draft ? draft.salBaseSeed : ({ ...heSalBase }));
    const [salBaseOpen, setSalBaseOpen] = useState(false);
    const [salBaseSearch, setSalBaseSearch] = useState("");
    const savingRef = useRef(false);
    // Espejar el estado al respaldo en CADA cambio (proteccion anti-remount).
    useEffect(() => {
      heDraftRef.current = { key: draftKey, hours, projOvr, salBaseEdits, salBaseSeed, dirty };
    }, [draftKey, hours, projOvr, salBaseEdits, salBaseSeed, dirty]);
    const days = heDiasQ(sheet.periodo, sheet.quincena);
    const assignments = sheet.assignments || {};

    // Hora base con el ajuste LOCAL (preview inmediato antes de guardar).
    const hbOf = (e) => { const ov = salBaseEdits[e.id]; const base = (ov != null && ov !== "" && !isNaN(Number(ov)) && Number(ov) > 0) ? Number(ov) : (Number(e.salary) || 0); return base / 30 / 8; };
    const tieneAjuste = (e) => { const ov = salBaseEdits[e.id]; return ov != null && ov !== "" && Number(ov) > 0 && Number(ov) !== (Number(e.salary) || 0); };
    const nAjustes = ae.filter(e => tieneAjuste(e)).length;
    const setSalBase = (eid, val) => { setSalBaseEdits(m => { const n = { ...m }; if (val === "" || val == null) delete n[eid]; else n[eid] = val; return n; }); setDirty(true); };
    // Etiqueta de banda segun el dia: sabado la jornada termina a las 11am, asi
    // que la 1a banda (+25%) corre de 11am a 7pm (no de 4-7pm como entre semana).
    const bandLbl = (b, d) => (d.isSat && b.k === "b1") ? "11-7" : b.label;

    const assignedShorts = [...new Set(ae.map(e => resolveShortHR(assignments[e.id])).filter(Boolean))];
    const projGroups = hrProjects.filter(p => assignedShorts.includes(p.short) || ae.some(e => assignments[e.id] === p.short));
    assignedShorts.forEach(s => { if (!projGroups.some(p => p.short === s)) projGroups.push({ short: s, name: s, code: "" }); });
    // Grupos "fantasma" para proyectos que solo reciben HE reasignadas
    [...new Set(Object.values(projOvr).map(s => resolveShortHR(s)).filter(Boolean))].forEach(s => {
      if (!projGroups.some(p => p.short === s)) projGroups.push({ short: s, name: s, code: "" });
    });

    const setOverride = (eid, day, short) => {
      const k = `${eid}-${day}`;
      setProjOvr(o => {
        const n = { ...o };
        if (!short || short === resolveShortHR(assignments[eid])) delete n[k];
        else n[k] = short;
        return n;
      });
      setEditingCell(null);
      setDirty(true);
    };
    // Proyecto atribuido de un dia (override o base de cuadrilla)
    const projDe = (eid, day) => projOvr[`${eid}-${day}`]
      ? resolveShortHR(projOvr[`${eid}-${day}`])
      : resolveShortHR(assignments[eid]);

    const setCell = (eid, day, bandK, raw) => {
      if (!/^\d{0,2}([.,]\d{0,2})?$/.test(raw)) return; // solo numeros con decimal
      const k = `${eid}-${day}`;
      setHours(h => ({ ...h, [k]: { ...(h[k] || { b1: "", b2: "", b3: "" }), [bandK]: raw } }));
      setDirty(true);
    };

    // Totales por empleado
    const empTotals = (e) => {
      const hb = hbOf(e);
      let hrs = 0, costo = 0;
      days.forEach(d => {
        const c = hours[`${e.id}-${d.day}`];
        if (!c) return;
        HE_BANDAS.forEach(b => {
          const h = heNum(c[b.k]);
          if (h <= 0) return;
          hrs += h;
          costo += h * heMult(d.isSun, b) * hb;
        });
      });
      return { hrs, costo };
    };

    let granHrs = 0, granCosto = 0;

    const guardar = async () => {
      if (savingRef.current) return; // anti doble-clic mientras guarda
      savingRef.current = true;
      try { await guardarInner(); } finally { savingRef.current = false; }
    };
    const guardarInner = async () => {
      // Normalizar: solo celdas con algun valor > 0, como numeros.
      const norm = {};
      Object.entries(hours).forEach(([k, c]) => {
        const b1 = heNum(c.b1), b2 = heNum(c.b2), b3 = heNum(c.b3);
        if (b1 + b2 + b3 <= 0) return;
        norm[k] = { b1, b2, b3 };
      });
      // GUARDIA anti-vaciado: si la hoja TENIA horas y ahora va sin ninguna,
      // pedir confirmacion explicita (asi un reset accidental no borra nada).
      if (Object.keys(norm).length === 0 && Object.keys(sheet.hours || {}).length > 0) {
        if (!confirm(`⚠️ ATENCIÓN: estás por guardar la hoja ${sheet.quincena} ${sheet.periodo} SIN NINGUNA HORA.\n\nLa hoja tenía ${Object.keys(sheet.hours).length} celda(s) con horas que se BORRARÍAN.\n\n¿Seguro que querés guardarla vacía?`)) return;
      }
      const record = { ...sheet, hours: norm, projOverrides: projOvr, lastSaved: new Date().toISOString() };
      // MERGE por hoja contra la NUBE (lectura DIRECTA getCloud, sin cache
      // local que pueda estar viejo): union nube + memoria quedandose con la
      // version MAS RECIENTE de cada hoja (company|periodo|quincena) — nunca
      // se pisan otras hojas aunque esta pestana este desactualizada — y la
      // hoja que se esta guardando manda sobre todas sus versiones. De paso
      // colapsa duplicados de la misma quincena.
      let cloudArr = null;
      try { const c = await store.getCloud("hr-he"); if (Array.isArray(c)) cloudArr = c; } catch { cloudArr = null; /* nube caida: union solo con memoria */ }
      const keyOf = h => `${h.company}|${h.periodo}|${h.quincena}`;
      const byKey = {};
      [...(Array.isArray(hes) ? hes : []), ...(cloudArr || [])].forEach(h => {
        if (!h || !h.id) return;
        const kk = keyOf(h);
        const cur = byKey[kk];
        if (!cur || String(h.lastSaved || h.date || "") > String(cur.lastSaved || cur.date || "")) byKey[kk] = h;
      });
      byKey[keyOf(record)] = record;
      const updated = Object.values(byKey);
      const ok = await sHe(updated);
      if (!ok) {
        alert("⚠️ Las horas extras se guardaron en este dispositivo pero NO se sincronizaron a la nube.\n\nRevisa tu conexion y volve a tocar Guardar. El modal queda abierto.");
        return;
      }
      // VERIFICAR con lectura DIRECTA a la nube (getCloud no usa el cache
      // local, asi que esto confirma lo que REALMENTE quedo en Supabase):
      // la hoja debe estar con ESTE lastSaved y la misma cantidad de celdas.
      let verified = false;
      try {
        const back = await store.getCloud("hr-he");
        const mine = Array.isArray(back) ? back.find(h => h.id === record.id) : null;
        verified = !!mine && mine.lastSaved === record.lastSaved && Object.keys(mine.hours || {}).length === Object.keys(norm).length;
      } catch { verified = false; }
      if (!verified) {
        alert("⚠️ El guardado NO se pudo VERIFICAR en la nube.\n\nNO cierres la hoja: revisá tu conexión y tocá Guardar de nuevo.");
        return;
      }
      // Persistir los ajustes de salario base HE — merge contra la nube
      // fresca aplicando SOLO los empleados que el usuario CAMBIO esta
      // sesion (diff contra el seed). No pisa ajustes de la otra empresa ni
      // ajustes concurrentes que esta sesion nunca vio.
      const cleanBase = {};
      Object.entries(salBaseEdits).forEach(([k, v]) => { if (v !== "" && v != null && Number(v) > 0) cleanBase[k] = Number(v); });
      const baseChanged = JSON.stringify(cleanBase) !== JSON.stringify(heSalBase);
      if (baseChanged) {
        let cloudMap = heSalBase;
        try { const cm = await store.getCloud("hr-he-salbase"); if (cm && typeof cm === "object" && !Array.isArray(cm)) cloudMap = cm; } catch { /* nube caida: partir de memoria */ }
        const mergedMap = { ...cloudMap };
        ae.forEach(e => {
          const antes = (salBaseSeed[e.id] != null && salBaseSeed[e.id] !== "" && Number(salBaseSeed[e.id]) > 0) ? Number(salBaseSeed[e.id]) : null;
          const ahora = cleanBase[e.id] != null ? cleanBase[e.id] : null;
          if (antes === ahora) return; // no lo toco esta sesion → respetar lo que haya en la nube
          if (ahora != null) mergedMap[e.id] = ahora; else delete mergedMap[e.id];
        });
        const okB = await sHeSalBase(mergedMap);
        if (!okB) { alert("⚠️ Las HORAS quedaron guardadas y verificadas, pero el ajuste de salario base NO se sincronizó. Abrí la hoja y tocá Guardar de nuevo."); return; }
      }
      heDraftRef.current = null; // respaldo ya no necesario
      const totHrs = Object.values(norm).reduce((s, c) => s + c.b1 + c.b2 + c.b3, 0);
      alert(`✅ Horas extras ${sheet.quincena} ${sheet.periodo} guardadas y VERIFICADAS en la nube.\n\n${Object.keys(norm).length} celda(s) · ${totHrs} horas.`);
      setDirty(false); setModal(null);
    };

    const inputStyle = (bg) => ({ width: 34, padding: "3px 2px", border: "1px solid rgba(44,42,40,.1)", borderRadius: 6, fontSize: 11, textAlign: "center", background: bg, outline: "none", fontFamily: "inherit", color: CHARCOAL });

    // ── Reporte PDF de Horas Extras ──
    // ESTRUCTURA (pedido de Gerson/la Lic., ago 2026):
    //   1) RESUMEN GENERAL POR COLABORADOR (PARA PLANILLA) — una fila por
    //      persona con TODOS sus proyectos sumados, separado en PERMANENTES
    //      y TEMPORALES. Eso es lo que se mete a planilla.
    //   2) DETALLE POR PROYECTO (PARA COSTOS POR PROYECTO) — en pagina
    //      nueva; el desglose de donde se trabajaron (reasignaciones incl.).
    // Ventana de impresion → "Guardar como PDF".
    const exportHePDF = () => {
      const w = window.open("", "_blank");
      if (!w) { alert("Permite popups para generar el PDF"); return; }
      const fL = fmtLps;
      const fH = (n) => Number.isInteger(n) ? n : n.toFixed(2);
      const pago = sheet.quincena === "1Q"
        ? `2Q ${sheet.periodo} (fin de mes)`
        : (() => { const [py, pm] = sheet.periodo.split("-").map(Number); const d2 = new Date(py, pm, 1); return `1Q ${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, "0")} (15 del mes)`; })();

      // Agregacion POR PROYECTO: cada dia se atribuye al proyecto del override
      // (1*) o al de la cuadrilla. Un colaborador con dias en varios proyectos
      // aparece en cada proyecto con SOLO las horas/costo que corresponden ahi.
      const perProj = {}; // short -> { emps: {empId: row}, hrs, costo }
      let hayAjuste = false;
      ae.forEach(e => {
        const hb = hbOf(e);
        const ajuste = tieneAjuste(e);
        days.forEach(d => {
          const c = hours[`${e.id}-${d.day}`];
          if (!c) return;
          const pr = projDe(e.id, d.day) || "—";
          HE_BANDAS.forEach(b => {
            const h = heNum(c[b.k]);
            if (h <= 0) return;
            const costo = h * heMult(d.isSun, b) * hb;
            if (!perProj[pr]) perProj[pr] = { emps: {}, hrs: 0, costo: 0 };
            const P = perProj[pr];
            if (!P.emps[e.id]) P.emps[e.id] = { e, hb, ajuste, b1: 0, b2: 0, b3: 0, dom: 0, hrs: 0, total: 0 };
            const R = P.emps[e.id];
            if (ajuste) hayAjuste = true;
            if (d.isSun) R.dom += h; else if (b.k === "b1") R.b1 += h; else if (b.k === "b2") R.b2 += h; else R.b3 += h;
            R.hrs += h; R.total += costo;
            P.hrs += h; P.costo += costo;
          });
        });
      });
      const proyOrden = Object.entries(perProj).sort((a, b) => b[1].costo - a[1].costo);
      const granH = proyOrden.reduce((s, [, p]) => s + p.hrs, 0);
      const granL = proyOrden.reduce((s, [, p]) => s + p.costo, 0);
      const nColab = new Set(proyOrden.flatMap(([, p]) => Object.keys(p.emps))).size;
      const projFullName = (short) => { const p = hrProjects.find(x => x.short === short); return (p && p.name && p.name !== short) ? p.name : ""; };
      // Misma tabla para el resumen por colaborador y el detalle por proyecto.
      const COLS_HE = [
        { t: "Colaborador" }, { t: "L/hora", num: true, ancho: "88px" },
        { t: "+25% · 4-7pm, sáb 11-7", num: true, ancho: "70px" }, { t: "+50% · 7-10pm", num: true, ancho: "62px" },
        { t: "+75% · 10-12am", num: true, ancho: "62px" }, { t: "×2 · domingo", num: true, ancho: "62px" },
        { t: "Horas", num: true, ancho: "52px" }, { t: "Total", num: true, ancho: "100px" },
      ];
      const nh = (n) => n ? fH(n) : `<span style="color:${RP.texto3}">—</span>`;
      const tablaHe = (rows, etiquetaSub, hrs, tot) => rTabla({
        columnas: COLS_HE,
        filas: rows.map(r => [
          `<b>${escHTML(r.e.fullName)}</b>`,
          `${fL(r.hb)}${r.ajuste ? ` <b style="color:${RP.naranjaTexto}">*</b>` : ""}`,
          nh(r.b1), nh(r.b2), nh(r.b3), nh(r.dom),
          `<b>${fH(r.hrs)}</b>`, `<b>${fL(r.total)}</b>`,
        ]),
        total: [escHTML(etiquetaSub), "", "", "", "", "", fH(hrs), fL(tot)],
      });
      // Cada proyecto con su pastel (29-oct-2026): el mismo tono en el
      // resumen de arriba y en su sección del detalle.
      const pcHe = pastelesDe(proyOrden.map(([pr]) => pr));
      const projSection = ([pr, P]) => {
        const rows = Object.values(P.emps).sort((a, b) => b.total - a.total);
        const fn = projFullName(pr);
        return rSeccionProyecto(pcHe[pr], `${pr}${fn ? ` · ${fn}` : ""}`, tablaHe(rows, `Subtotal ${pr}`, P.hrs, P.costo), `<span class="mono">${fH(P.hrs)} hrs · ${fL(P.costo)}</span>`);
      };
      const resumenProyHe = proyOrden.length > 1 ? rSeccion("Por proyecto", rTabla({
        columnas: [{ t: "Proyecto" }, { t: "Colaboradores", num: true, ancho: "100px" }, { t: "Horas", num: true, ancho: "80px" }, { t: "Total", num: true, ancho: "120px" }, { t: "", ancho: "200px" }],
        filas: proyOrden.map(([pr, P]) => [
          `${rProyecto(pcHe[pr], pr)} <span class="suave">${escHTML(projFullName(pr))}</span>`,
          Object.keys(P.emps).length, fH(P.hrs), `<b>${fL(P.costo)}</b>`,
          rBarra([{ valor: P.costo, color: pcHe[pr].base }], proyOrden[0][1].costo),
        ]),
      })) : "";

      // ── RESUMEN GENERAL POR COLABORADOR (para planilla) ──
      // Una fila por persona sumando TODOS sus proyectos (ej: Henry Polanco
      // con horas en 2 proyectos sale UNA vez con el total combinado),
      // separado en PERMANENTES y TEMPORALES segun la ficha (contractType).
      // Alfabetico: la Lic. busca por nombre al meter a planilla.
      const perEmp = {}; // empId -> {e, hb, ajuste, b1, b2, b3, dom, hrs, total}
      proyOrden.forEach(([, P]) => Object.values(P.emps).forEach((r) => {
        if (!perEmp[r.e.id]) perEmp[r.e.id] = { e: r.e, hb: r.hb, ajuste: r.ajuste, b1: 0, b2: 0, b3: 0, dom: 0, hrs: 0, total: 0 };
        const T = perEmp[r.e.id];
        T.b1 += r.b1; T.b2 += r.b2; T.b3 += r.b3; T.dom += r.dom; T.hrs += r.hrs; T.total += r.total;
      }));
      const grupoDe = (e) => (e.contractType === "permanent" ? "PERMANENTES" : e.contractType === "temporary" ? "TEMPORALES" : "OTROS (HONORARIOS / SIN CONTRATO)");
      const bloques = ["PERMANENTES", "TEMPORALES", "OTROS (HONORARIOS / SIN CONTRATO)"]
        .map((g) => [g, Object.values(perEmp).filter((r) => grupoDe(r.e) === g).sort((a, b) => String(a.e.fullName).localeCompare(b.e.fullName))])
        .filter(([, rows]) => rows.length);
      const NOMBRE_GRUPO = { "PERMANENTES": "Permanentes", "TEMPORALES": "Temporales", "OTROS (HONORARIOS / SIN CONTRATO)": "Otros (honorarios / sin contrato)" };
      const bloqueSection = ([g, rows]) => {
        const hrsG = rows.reduce((s, r) => s + r.hrs, 0), totG = rows.reduce((s, r) => s + r.total, 0);
        return rSeccion(`${NOMBRE_GRUPO[g]} · ${rows.length} colaborador${rows.length !== 1 ? "es" : ""}`,
          tablaHe(rows, `Subtotal ${g.toLowerCase()}`, hrsG, totG), `<span class="mono">${fH(hrsG)} hrs · ${fL(totG)}</span>`);
      };

      const cuerpo = rKpis([
        { label: "Total a pagar", valor: fL(granL), sub: `se paga en planilla ${pago}` },
        { label: "Horas extras", valor: fH(granH) },
        { label: "Colaboradores", valor: nColab },
        { label: "Proyectos", valor: proyOrden.length },
      ])
        + resumenProyHe
        // El rótulo viaja pegado al primer bloque: si no, quedaba solo al pie
        // de la página 1 y su tabla arrancaba en la 2.
        + `<div style="break-inside:avoid;page-break-inside:avoid"><div style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${RP.texto3};margin-bottom:10px">Resumen general por colaborador · para planilla</div>${bloques.length ? bloqueSection(bloques[0]) : ""}</div>`
        + bloques.slice(1).map(bloqueSection).join("")
        + rTabla({ columnas: [{ t: "" }, { t: "", num: true }], filas: [], total: [`Total general · ${sheet.quincena} ${sheet.periodo}`, `${fH(granH)} hrs · ${fL(granL)}`] })
        + `<div class="rp-salto"></div>`
        + `<div style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${RP.texto3};margin-bottom:10px">Detalle por proyecto · para costos por proyecto</div>`
        + proyOrden.map(projSection).join("")
        + `<div class="rp-nota" style="line-height:1.6">Hora base = salario ÷ 30 ÷ 8 (sin bonificación) · 4-7pm ×1.25 · 7-10pm ×1.50 · 10pm-12am ×1.75 · domingo ×2 en todas las bandas. Sábados: la jornada termina a las 11am, la 1ª banda (+25%) corre de 11am-7pm.
          ${hayAjuste ? `<b style="color:${RP.naranjaTexto}">* Hora extra pactada sobre un salario base especial</b> (arreglo), distinto del salario real. ` : ""}Pago quincena vencida: estas HE de ${sheet.quincena} ${sheet.periodo} se pagan en la planilla ${pago}. Proyectos según cuadrilla + reasignaciones por día.</div>`;
      abrirReporte(w, reporteHTML({ titulo: "Reporte de horas extras", subtitulo: `${cc.name} · Quincena trabajada ${sheet.quincena} ${sheet.periodo} · se paga en planilla ${pago}`, empresa: sheet.company || co, cuerpo }));
    };

    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="gt-vidrio" style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ font: "800 16px/1.2 var(--display)", color: CHARCOAL }}>Horas extras {etiquetaCorta(sheet.periodo, sheet.quincena)} · {cc.name}</div>
          <div style={{ fontSize: 12, color: "#6E6862", marginTop: 3 }}>Horas por banda y por día. Click derecho en una celda: cargar esas horas a otro proyecto. {hePagoLabel(sheet.quincena).toLowerCase().replace(/(\d)q/g, "$1Q").replace(/^se pagan/, "Se pagan")}.</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {[["4–7 pm", "+25 %"], ["7–10 pm", "+50 %"], ["10–12", "+75 %"], ["Domingo", "×2"], ["Sábado", "banda 1 desde 11 am"]].map(([k, l]) => <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "#6E6862" }}><span style={{ padding: "2px 7px", borderRadius: 6, background: "rgba(44,42,40,.06)", color: CHARCOAL, fontWeight: 800, fontSize: 10.5 }}>{k}</span>{l}</span>)}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }} />
        {/* El overlay muestra salarios reales — solo para quien puede verlos */}
        {!hideSalary && btnH(`Salario base de HE${nAjustes ? ` · ${nAjustes} ajustado${nAjustes > 1 ? "s" : ""}` : ""}`, () => setSalBaseOpen(true), { chico: true })}
      </div>

      {/* Overlay: ajustar el salario base sobre el que se paga la HORA EXTRA
          (arreglos especiales, p.ej. pagar a salario minimo). Es LOCAL — se
          persiste al tocar "Guardar horas extras". */}
      {salBaseOpen && (
        <div onClick={() => setSalBaseOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 3000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}>
          <div onClick={ev => ev.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 640, boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #E2E8F0" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>⚙ Salario base de la hora extra</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 3, lineHeight: 1.45 }}>
                Para casos especiales con arreglo (ej: la HE se paga a <b>salario mínimo</b>). Dejá vacío para usar el salario real.
                La hora extra = <b>salario base ÷ 30 ÷ 8</b>. Aplica a <b>todas</b> las quincenas y se refleja en Costos. Se guarda al tocar <b>Guardar horas extras</b>.
              </div>
              <input value={salBaseSearch} onChange={e => setSalBaseSearch(e.target.value)} placeholder="🔍 Buscar colaborador…" style={{ marginTop: 10, width: "100%", padding: "8px 11px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div style={{ maxHeight: "55vh", overflowY: "auto", padding: "6px 12px" }}>
              {ae.filter(e => !salBaseSearch || e.fullName.toLowerCase().includes(salBaseSearch.toLowerCase())).sort((a, b) => a.fullName.localeCompare(b.fullName)).map(e => {
                const real = Number(e.salary) || 0;
                const aj = tieneAjuste(e);
                return (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 6px", borderBottom: "1px solid #F1F5F9", background: aj ? "#FFF7ED" : "transparent" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1E293B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.fullName}{aj && <span style={{ color: "#B45309", fontWeight: 800 }}> *</span>}</div>
                      <div style={{ fontSize: 10.5, color: "#94A3B8" }}>Salario real: {fmtL(real)} · hora real {fmtL(real / 30 / 8)}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontSize: 11, color: "#64748b" }}>Base HE L</span>
                        <input value={salBaseEdits[e.id] ?? ""} onChange={ev => { const v = ev.target.value; if (/^\d{0,7}([.,]\d{0,2})?$/.test(v)) setSalBase(e.id, v); }} placeholder={String(real)} style={{ width: 96, padding: "5px 7px", border: `1px solid ${aj ? "#F59E0B" : "#CBD5E1"}`, borderRadius: 6, fontSize: 12, textAlign: "right", background: aj ? "#FFFBEB" : "#fff" }} />
                      </div>
                      <div style={{ fontSize: 10, color: aj ? "#B45309" : "#CBD5E1", fontWeight: aj ? 700 : 400 }}>hora HE: {fmtL(hbOf(e))}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: "12px 20px", borderTop: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11.5, color: "#92400E" }}>{nAjustes ? `${nAjustes} colaborador${nAjustes > 1 ? "es" : ""} con salario base especial` : "Sin ajustes — todos a su salario real"}</span>
              <Btn variant="primary" onClick={() => setSalBaseOpen(false)}>Listo</Btn>
            </div>
          </div>
        </div>
      )}

      {projGroups.map(proj => {
        const pEmps = ae.filter(e => resolveShortHR(assignments[e.id]) === proj.short);
        // Subtotal ATRIBUIDO: respeta los overrides por dia — las HE
        // reasignadas cuentan para el proyecto que las recibio.
        let subHrs = 0, subCosto = 0;
        ae.forEach(e => {
          const hb = hbOf(e);
          days.forEach(d => {
            if (projDe(e.id, d.day) !== proj.short) return;
            const c = hours[`${e.id}-${d.day}`];
            if (!c) return;
            HE_BANDAS.forEach(b => {
              const h = heNum(c[b.k]);
              if (h > 0) { subHrs += h; subCosto += h * heMult(d.isSun, b) * hb; }
            });
          });
        });
        if (pEmps.length === 0 && subHrs <= 0) return null;
        const rows = pEmps.map(e => ({ e, t: empTotals(e) }));
        granHrs += subHrs; granCosto += subCosto;
        return <div key={proj.short} className="gt-vidrio" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", borderBottom: "1px solid rgba(44,42,40,.07)" }}>
            <span style={{ font: "800 14px/1.2 var(--display)", color: CHARCOAL }}>{proj.short} <span style={{ color: "#A39C92", fontWeight: 600, fontSize: 12.5 }}>{pEmps.length}</span></span>
            <span style={{ fontSize: 12.5, color: "#6E6862" }}>{fmtDias(subHrs)} h{hideSalary ? "" : <> · <b style={{ color: "#177243" }}>{fmtL(subCosto)}</b></>}</span>
          </div>
          {pEmps.length === 0 && (
            <div style={{ padding: "8px 14px", fontSize: 11, color: "#64748b", fontStyle: "italic" }}>
              Solo horas reasignadas desde otros proyectos (celdas azules en las cuadrillas de origen).
            </div>
          )}
          {pEmps.length > 0 && <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: "rgba(44,42,40,.025)" }}>
                  <th rowSpan={2} style={{ ...TH_H, position: "sticky", left: 0, background: "#FAFAF9", zIndex: 2, minWidth: 160, verticalAlign: "bottom" }}>Colaborador</th>
                  {days.map(d => (
                    <th key={d.day} colSpan={3} title={d.isHoliday ? "Feriado" : d.isSun ? "Domingo — todas las bandas ×2" : d.isSat ? "Sábado — jornada hasta 11am; la 1ª banda (+25%) va de 11am a 7pm" : ""} style={{ ...TH_H, textAlign: "center", background: d.isSun ? "rgba(232,118,45,.06)" : "transparent", borderLeft: "2px solid rgba(44,42,40,.07)" }}>
                      <div style={{ fontSize: 9, color: d.isSun ? "#A94E16" : "#A39C92" }}>{d.dow}{d.isSun ? " ×2" : d.isSat ? " 11am" : ""}</div>
                      {d.day}
                    </th>
                  ))}
                  <th rowSpan={2} style={{ ...TH_H, textAlign: "center", verticalAlign: "bottom" }}>Horas</th>
                  <th rowSpan={2} style={{ ...TH_H, textAlign: "right", verticalAlign: "bottom" }}>Total</th>
                </tr>
                <tr>
                  {days.map(d => HE_BANDAS.map((b, i) => (
                    <th key={`${d.day}-${b.k}`} title={d.isSat && b.k === "b1" ? "Sábado: 11am-7pm (+25%)" : ""} style={{ padding: "2px 1px", fontSize: 8, fontWeight: 700, color: b.fg, background: b.bg, textAlign: "center", minWidth: 36, borderLeft: i === 0 ? "2px solid #E2E8F0" : "1px solid #F1F5F9" }}>{bandLbl(b, d)}</th>
                  )))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ e, t }) => (
                  <tr key={e.id} style={{ borderBottom: "1px solid rgba(44,42,40,.06)" }}>
                    <td style={{ ...TD_H, position: "sticky", left: 0, background: "#FAFAF9", zIndex: 1, fontWeight: 600, fontSize: 11 }}>
                      <div>{e.fullName}</div>
                      {/* La hora base delata el salario (×240): oculta para roles sin acceso a montos */}
                      {!hideSalary && <div title={tieneAjuste(e) ? `Hora extra pactada sobre salario base especial de ${fmtL(Number(salBaseEdits[e.id]))} (arreglo), no su salario real` : "Hora base = salario ÷ 30 ÷ 8"} style={{ fontSize: 9, color: tieneAjuste(e) ? "#B45309" : "#94A3B8", fontWeight: tieneAjuste(e) ? 700 : 400, cursor: "pointer" }} onClick={() => setSalBaseOpen(true)}>hora: {fmtL(hbOf(e))}{tieneAjuste(e) ? " *" : ""}</div>}
                    </td>
                    {days.map(d => HE_BANDAS.map((b, i) => {
                      const k = `${e.id}-${d.day}`;
                      const val = hours[k]?.[b.k] ?? "";
                      const ovr = projOvr[k];
                      const isEditing = editingCell === k;
                      return <td key={`${k}-${b.k}`}
                        onContextMenu={(ev) => { ev.preventDefault(); setEditingCell(isEditing ? null : k); }}
                        title={ovr ? `HE cargadas a ${ovr} — click derecho para cambiar` : "Click derecho: cargar estas HE a otro proyecto"}
                        style={{ padding: "3px 2px", textAlign: "center", borderLeft: i === 0 ? "2px solid rgba(44,42,40,.07)" : "none", background: ovr ? "rgba(29,95,175,.08)" : d.isSun ? "rgba(232,118,45,.05)" : "transparent", position: "relative" }}>
                        <input value={val} onChange={ev => setCell(e.id, d.day, b.k, ev.target.value)} placeholder="·" style={inputStyle(val ? b.bg : ovr ? "#EFF6FF" : "#fff")} />
                        {ovr && i === 0 && <div style={{ fontSize: 7, color: "#6E6862", fontWeight: 700, lineHeight: 1, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden" }}>{ovr}</div>}
                        {isEditing && i === 0 && (
                          <div style={{ position: "absolute", top: "100%", left: 0, background: "#fff", border: "1px solid #CBD5E1", borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,.15)", zIndex: 10, minWidth: 170, maxHeight: 220, overflowY: "auto", textAlign: "left" }} onClick={ev => ev.stopPropagation()}>
                            <div style={{ padding: "4px 8px", fontSize: 10, color: "#64748b", borderBottom: "1px solid #F1F5F9" }}>HE del día {d.day} se cargan a:</div>
                            <div style={{ padding: "4px 8px", fontSize: 11, cursor: "pointer", background: !ovr ? "#EFF6FF" : "transparent" }} onClick={() => setOverride(e.id, d.day, null)}>✓ {resolveShortHR(assignments[e.id]) || "—"} (base)</div>
                            {hrProjects.filter(p => p.short !== resolveShortHR(assignments[e.id])).map(p => (
                              <div key={p.short} style={{ padding: "4px 8px", fontSize: 11, cursor: "pointer", background: ovr === p.short ? "#DBEAFE" : "transparent" }} onClick={() => setOverride(e.id, d.day, p.short)}>{ovr === p.short ? "✓ " : ""}{p.short}</div>
                            ))}
                          </div>
                        )}
                      </td>;
                    }))}
                    <td style={{ ...TD_H, textAlign: "center", fontWeight: 700, color: CHARCOAL }}>{t.hrs > 0 ? fmtDias(t.hrs) : ""}</td>
                    <td style={{ ...TD_H, textAlign: "right", fontWeight: 700, color: "#177243", whiteSpace: "nowrap" }}>{t.costo > 0 && !hideSalary ? fmtL(t.costo) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </div>;
      })}

      <div className="gt-vidrio" style={{ padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span style={{ font: "800 14px/1.2 var(--display)", color: CHARCOAL }}>Total de la quincena</span>
        <span style={{ font: "800 18px/1 var(--display)", color: CHARCOAL }}>{fmtDias(granHrs)} h{hideSalary ? "" : <span style={{ color: "#177243" }}> · {fmtL(granCosto)}</span>}</span>
      </div>

      {dirty && <div className="gt-vidrio" style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: CHARCOAL }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: ORANGE }} /><b>Tenés cambios sin guardar.</b> Tocá Guardar horas extras antes de cerrar.</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button type="button" className="gt-btn" onClick={() => {
          if (dirty && !confirm("Tenés cambios SIN GUARDAR.\n\n¿Cerrar sin guardar?")) return;
          heDraftRef.current = null; // descarte explicito del respaldo
          setModal(null);
        }}>Cerrar</button>
        {btnH("PDF para planilla", exportHePDF)}
        <button type="button" className="gt-btn gt-btn-primario" onClick={guardar}>Guardar horas extras</button>
      </div>
    </div>;
  };

  // Form "Nueva hoja de horas extras": pregunta periodo + quincena, muestra
  // en que planilla se paga (quincena vencida) y de que cuadrilla copiar la
  // distribucion. Permite crear HE de quincenas SIN cuadrilla propia (ej:
  // 1Q julio usando la distribucion de la 2Q).
  const HeNewForm = () => {
    // Default inteligente: la quincena que se esta PAGANDO ahora (la anterior
    // a la actual) — que es la que normalmente se esta digitando.
    const now = new Date();
    const curPer = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prevPer = (() => { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; })();
    const [per, setPer] = useState(now.getDate() >= 16 ? curPer : prevPer);
    const [q, setQ] = useState(now.getDate() >= 16 ? "1Q" : "2Q");
    const [cuadId, setCuadId] = useState("");

    const cqSorted = cq.slice().sort((a, b) => `${b.periodo}-${b.quincena}`.localeCompare(`${a.periodo}-${a.quincena}`));
    const cuadSel = cqSorted.find(c => c.id === cuadId)
      || cqSorted.find(c => c.periodo === per && c.quincena === q)
      || cqSorted[0] || null;
    const yaExiste = che.filter(h => h.periodo === per && h.quincena === q)
      .sort((a, b) => String(b.lastSaved || "").localeCompare(String(a.lastSaved || "")))[0];

    const pagoLabel = (() => {
      if (!per) return "";
      if (q === "1Q") return `a FIN DE MES con la planilla 2Q ${per}`;
      const [py, pm] = per.split("-").map(Number);
      const d = new Date(py, pm, 1);
      return `el 15 del mes siguiente con la planilla 1Q ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    })();

    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Input label="Periodo (mes en que se TRABAJARON)" type="month" value={per} onChange={e => setPer(e.target.value)} />
        <Select label="Quincena trabajada" options={[{ value: "1Q", label: "1Q (1-15)" }, { value: "2Q", label: "2Q (16-31)" }]} value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {per && <div style={{ background: "#FFF7ED", border: "1px solid #FDBA74", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#9A3412" }}>
        💰 Las HE de <b>{q} {per}</b> se pagan <b>{pagoLabel}</b> (pago quincena vencida) — y así aparecerán en el tab Costos.
      </div>}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#8B847C", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Usar distribución de cuadrilla</div>
        <select value={cuadSel?.id || ""} onChange={e => setCuadId(e.target.value)} style={{ width: "100%", padding: "9px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 13, background: "#fff" }}>
          {cqSorted.length === 0 && <option value="">No hay cuadrillas — creá una en Asistencia</option>}
          {cqSorted.map(c => <option key={c.id} value={c.id}>{c.quincena} {c.periodo} · {Object.values(c.assignments || {}).filter(Boolean).length} empleados asignados</option>)}
        </select>
        {cuadSel && cuadSel.periodo !== per || (cuadSel && cuadSel.quincena !== q) ? (
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>Se copia la distribución de <b>{cuadSel.quincena} {cuadSel.periodo}</b> — podés reasignar días con click derecho si alguien estuvo en otro proyecto.</div>
        ) : null}
      </div>
      {yaExiste && <div style={{ background: "#EFF6FF", border: "1px solid #93C5FD", borderRadius: 10, padding: "9px 14px", fontSize: 12, color: "#1E40AF" }}>
        ℹ️ Ya existe una hoja de HE para {q} {per} — se va a abrir esa (no se duplica).
      </div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
        <Btn variant="success" onClick={() => {
          if (!per) return alert("Seleccioná el periodo");
          if (yaExiste) {
            setModal({ t: "he", d: { ...yaExiste } });
            return;
          }
          if (!cuadSel) return alert("No hay ninguna distribución de cuadrilla. Creá una en el tab Asistencia primero.");
          setModal({ t: "he", d: { id: uid(), company: co, periodo: per, quincena: q, assignments: { ...cuadSel.assignments }, hours: {}, date: new Date().toISOString(), basedOn: `${cuadSel.quincena} ${cuadSel.periodo}` } });
        }}>{yaExiste ? "Abrir hoja existente" : "Crear hoja de HE"}</Btn>
      </div>
    </div>;
  };

  const renderHE = () => {
    // Filas: unión de quincenas con cuadrilla y hojas HE ya creadas (una hoja
    // HE puede existir sin cuadrilla propia, ej. 1Q julio con distribución
    // copiada de la 2Q). Si hay hojas duplicadas gana la de último guardado.
    const rowsMap = {};
    cq.forEach(c => { rowsMap[`${c.periodo}|${c.quincena}`] = { periodo: c.periodo, quincena: c.quincena, cuad: c, he: null }; });
    che.forEach(h => {
      const k = `${h.periodo}|${h.quincena}`;
      if (!rowsMap[k]) rowsMap[k] = { periodo: h.periodo, quincena: h.quincena, cuad: null, he: h };
      else if (!rowsMap[k].he || String(h.lastSaved || "") > String(rowsMap[k].he.lastSaved || "")) rowsMap[k].he = h;
    });
    const rows = Object.values(rowsMap).sort((a, b) => `${b.periodo}-${b.quincena}`.localeCompare(`${a.periodo}-${a.quincena}`));
    const openHeRow = (r) => {
      const existing = r.he || che.filter(h => h.periodo === r.periodo && h.quincena === r.quincena).sort((a, b) => String(b.lastSaved || "").localeCompare(String(a.lastSaved || "")))[0];
      if (existing) setModal({ t: "he", d: { ...existing, assignments: r.cuad ? r.cuad.assignments : existing.assignments } });
      else if (r.cuad) setModal({ t: "he", d: { id: uid(), company: co, periodo: r.periodo, quincena: r.quincena, assignments: r.cuad.assignments, hours: {}, date: new Date().toISOString() } });
    };
    const sePaga = (r) => { if (r.quincena === "1Q") return `fin de mes · 2Q ${mesLabel(r.periodo)}`; const [py, pm] = r.periodo.split("-").map(Number); const d = new Date(py, pm, 1); return `el 15 · 1Q ${mesLabel(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)}`; };
    return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, color: "#6E6862" }}>Se registran en la quincena en que se trabajaron y se pagan quincena vencida. Hora base = salario ÷ 30 ÷ 8 · 4–7 pm +25 % · 7–10 pm +50 % · 10–12 +75 % · domingo ×2.</span>
        {!isReadOnly && btnH("+ Hoja de horas extras", () => setModal({ t: "he-new" }), { c: ORANGE_DARK, lleno: true, chico: true })}
      </div>
      {rows.length === 0 && <div className="gt-vidrio" style={{ padding: 28, textAlign: "center", fontSize: 13, color: "#6E6862" }}>Todavía no hay hojas de horas extras.</div>}
      {rows.map(r => {
        const rec = r.he; const hay = rec && Object.keys(rec.hours || {}).length > 0; const t = hay ? heTotalsOf(rec) : null;
        return <div key={`${r.periodo}|${r.quincena}`} className="gt-vidrio" style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", flexWrap: "wrap" }}>
          <div style={{ width: 86, flexShrink: 0 }}>
            <div style={{ font: "800 22px/1 var(--display)", color: CHARCOAL }}>{r.quincena}</div>
            <div style={{ fontSize: 11.5, color: "#6E6862", marginTop: 4 }}>{mesLabel(r.periodo)}</div>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            {hay ? <div style={{ fontSize: 13.5, fontWeight: 700, color: CHARCOAL }}>{fmtDias(t.hrs)} horas{hideSalary ? "" : <span style={{ color: "#177243" }}> · {fmtL(t.costo)}</span>}</div> : <div style={{ fontSize: 13.5, fontWeight: 700, color: "#A39C92" }}>Sin registrar</div>}
            <div style={{ fontSize: 12, color: "#6E6862", marginTop: 4 }}>Se paga {sePaga(r)}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {r.cuad ? chipH("Cuadrilla propia", "gris") : chipH(`Copiada${r.he?.basedOn ? ` de ${r.he.basedOn}` : ""}`, "azul")}
          </div>
          {btnH("Horas extras", () => openHeRow(r), { c: ORANGE_DARK, lleno: true, chico: true })}
        </div>;
      })}
    </div>;
  };

  // ── COSTO DE MANO DE OBRA POR PROYECTO (amarrado a la asistencia) ──
  // Modelo de pago por celda (espeja la planilla):
  //   Dia regular:  "1" = 1 dia (payByHour: fraccion por hora de entrada),
  //                 "INC" = 1 (incapacidad pagada), "0"/vacio = 0.
  //   Domingo:      "DT" = 2 (doble), "DT2" = 3 (triple),
  //                 "1"/"0"/"INC" = 1 (descanso pagado por ley), vacio = 0.
  //   Feriado:      "TF" = 3 (triple), "1"/"0"/"INC" = 1, vacio = 0.
  // Cada dia se atribuye al proyecto del override (1*) o al proyecto base de
  // la cuadrilla. Costo diario = (salario + bonificacion mensual) / 30 —
  // eso es lo que la persona le cuesta a la empresa por dia (pedido del
  // usuario 21-jul-2026). NO incluye cargas patronales (IHSS/RAP patronal).
  // `empList` (opcional): lista de empleados a iterar. Por default usa `ce`
  // (empresa activa del toggle); el reporte ejecutivo mensual lo llama con
  // los empleados de CADA empresa para globalizar sin depender del toggle.
  const calcCostoMO = (sheet, empList) => {
    const grid = sheet.grid || {};
    const ovr = sheet.projOverrides || {};
    const at = sheet.arrivalTimes || {};
    const assignments = sheet.assignments || {};
    const [y, m] = (sheet.periodo || "").split("-").map(Number);
    if (!y || !m) return { rows: [], total: 0, totalDias: 0, personas: 0 };
    const start = sheet.quincena === "1Q" ? 1 : 16;
    const end = sheet.quincena === "1Q" ? 15 : new Date(y, m, 0).getDate();
    const dias = [];
    for (let d = start; d <= end; d++) {
      const dt = new Date(y, m - 1, d);
      dias.push({ day: d, isSun: dt.getDay() === 0, isHoliday: esFeriadoQuincena(sheet.periodo, d) });
    }
    const porProyecto = {};
    const personasSet = new Set();
    (empList || ce).forEach(e => {
      const sd = ((Number(e.salary) || 0) + (Number(e.bonificacion) || 0)) / 30;
      const base = resolveShortHR(assignments[e.id]);
      dias.forEach(d => {
        // Dias fuera del rango de alta/baja NO se pagan aunque tengan un
        // valor guardado de antes (mismo fix que empStats — caso Norman).
        const dStr = `${sheet.periodo}-${String(d.day).padStart(2, "0")}`;
        if (e.startDate && dStr < e.startDate) return;
        if (fueraPorBaja(e, dStr)) return;
        const k = `${e.id}-${d.day}`;
        const v = grid[k] || "";
        let val = 0;
        if (d.isSun || d.isHoliday) {
          if (v === "DT") val = 2;
          else if (v === "DT2" || v === "TF") val = 3;
          else if (v) val = 1; // "1", "0", "INC", "V" — pagado por ley
        } else {
          if (v === "1") {
            val = 1;
            // Hora de entrada marcada (payByHour o tardanza GeoClock denegada):
            // descuento proporcional desde que VENCE LA TOLERANCIA del
            // horario del empleado (8:00 + 15 min → marcar 8:20 = 5 min).
            if (at[k]) {
              const [h, mm] = at[k].split(":").map(Number);
              val = Math.max(0, (8 - Math.max(0, h + mm / 60 - horaLimiteH(e))) / 8);
            }
          } else if (v === "INC" || v === "V") val = 1; // incapacidad y vacaciones: dia pagado
        }
        if (val <= 0) return;
        const proj = ovr[k] ? resolveShortHR(ovr[k]) : base;
        if (!proj) return;
        if (!porProyecto[proj]) porProyecto[proj] = { diasPag: 0, costo: 0, emps: {} };
        const P = porProyecto[proj];
        P.diasPag += val;
        P.costo += val * sd;
        personasSet.add(e.id);
        if (!P.emps[e.id]) P.emps[e.id] = { emp: e, sd, dias: 0, costo: 0 };
        P.emps[e.id].dias += val;
        P.emps[e.id].costo += val * sd;
      });
    });
    // HORAS EXTRAS pagadas en ESTA quincena = las trabajadas la quincena
    // ANTERIOR (pago quincena vencida — regla de la empresa): el proyecto
    // desembolsa esos fondos aqui, por eso se cargan a esta quincena.
    //   Viendo 2Q de un mes → HE de la 1Q del mismo mes.
    //   Viendo 1Q de un mes → HE de la 2Q del mes anterior.
    const prevQ = sheet.quincena === "2Q"
      ? { periodo: sheet.periodo, quincena: "1Q" }
      : (() => { const pd = new Date(y, m - 2, 1); return { periodo: `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, "0")}`, quincena: "2Q" }; })();
    const heSheet = hes.find(h => h.company === sheet.company && h.periodo === prevQ.periodo && h.quincena === prevQ.quincena);
    let totalHeHrs = 0, totalHeCosto = 0;
    if (heSheet) {
      const heDias = heDiasQ(heSheet.periodo, heSheet.quincena);
      const sunSet = new Set(heDias.filter(d => d.isSun).map(d => d.day));
      const heAssign = heSheet.assignments || {};
      const heOvr = heSheet.projOverrides || {};
      const hh = heSheet.hours || {};
      // OJO: mismo empList que el loop de dias — si aqui se itera `ce` a
      // secas, el reporte ejecutivo pierde las HE de la empresa NO activa
      // en el toggle (los ids nunca matchean las keys de hours).
      (empList || ce).forEach(e => {
        const hb = heHoraBase(e);
        const base = resolveShortHR(heAssign[e.id]);
        heDias.forEach(d => {
          const key = `${e.id}-${d.day}`;
          const c = hh[key];
          if (!c) return;
          // Atribucion POR DIA: si ese dia las HE fueron para otro proyecto
          // (override del grid), el costo se carga a ese proyecto.
          const proj = heOvr[key] ? resolveShortHR(heOvr[key]) : base;
          if (!proj) return;
          let hrs = 0, costoHe = 0;
          HE_BANDAS.forEach(b => {
            const h = heNum(c[b.k]);
            if (h <= 0) return;
            hrs += h;
            costoHe += h * heMult(sunSet.has(d.day), b) * hb;
          });
          if (hrs <= 0) return;
          if (!porProyecto[proj]) porProyecto[proj] = { diasPag: 0, costo: 0, emps: {} };
          const P = porProyecto[proj];
          personasSet.add(e.id);
          if (!P.emps[e.id]) P.emps[e.id] = { emp: e, sd: ((Number(e.salary) || 0) + (Number(e.bonificacion) || 0)) / 30, dias: 0, costo: 0 };
          P.emps[e.id].heHrs = (P.emps[e.id].heHrs || 0) + hrs;
          P.emps[e.id].heCosto = (P.emps[e.id].heCosto || 0) + costoHe;
          P.heHrs = (P.heHrs || 0) + hrs;
          P.heCosto = (P.heCosto || 0) + costoHe;
          totalHeHrs += hrs;
          totalHeCosto += costoHe;
        });
      });
    }

    const rows = Object.entries(porProyecto).map(([short, v]) => {
      const pj = findProjectHR(short);
      return {
        short,
        name: pj?.name || short,
        code: pj?.code || "",
        diasPag: v.diasPag,
        costoDias: v.costo,
        heHrs: v.heHrs || 0,
        heCosto: v.heCosto || 0,
        costo: v.costo + (v.heCosto || 0),
        emps: Object.values(v.emps).map(x => ({
          ...x,
          costoDias: x.costo,
          heHrs: x.heHrs || 0,
          heCosto: x.heCosto || 0,
          costo: x.costo + (x.heCosto || 0),
        })).sort((a, b) => b.costo - a.costo),
      };
    }).sort((a, b) => b.costo - a.costo);
    return {
      rows,
      total: rows.reduce((s, r) => s + r.costo, 0),
      totalDias: rows.reduce((s, r) => s + r.diasPag, 0),
      totalHeHrs,
      totalHeCosto,
      prevQLabel: `${prevQ.quincena} ${prevQ.periodo}`,
      hayHe: !!heSheet,
      personas: personasSet.size,
    };
  };

  const fmtDias = (n) => Number.isInteger(n) ? n : n.toFixed(2);

  const renderCostosMO = () => {
    // Hojas de asistencia de la empresa, mas reciente primero.
    const sheets = ca.slice().sort((a, b) => `${b.periodo}-${b.quincena}`.localeCompare(`${a.periodo}-${a.quincena}`));
    const sheet = sheets.find(s => s.id === costosSheetId) || sheets[0] || null;

    if (!sheet) {
      return <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12, padding: 24, textAlign: "center", color: "#92400E", fontSize: 14 }}>
        Todavía no hay asistencia registrada en {cc.name}.<br />
        <span style={{ fontSize: 12 }}>Registrá la asistencia de la quincena (tab Asistencia) y acá vas a ver el costo de mano de obra por proyecto.</span>
      </div>;
    }

    const { rows, total, totalDias, totalHeHrs, totalHeCosto, prevQLabel, hayHe, personas } = calcCostoMO(sheet);
    const titulo = `Costo de Mano de Obra — ${sheet.quincena} ${sheet.periodo}`;

    const exportCostosExcel = async () => {
      try {
        const filas = [];
        rows.forEach(r => {
          r.emps.forEach(x => {
            filas.push({ proy: r.short, emp: x.emp.fullName, cargo: x.emp.position || "", sal: Number(x.emp.salary) || 0, bon: Number(x.emp.bonificacion) || 0, sd: x.sd, dias: x.dias, cdias: x.costoDias, hehrs: x.heHrs, hecosto: x.heCosto, total: x.costo });
          });
          filas.push({ _sub: true, proy: r.short, emp: "SUBTOTAL", cargo: "", sal: null, bon: null, sd: null, dias: r.diasPag, cdias: r.costoDias, hehrs: r.heHrs, hecosto: r.heCosto, total: r.costo });
        });
        const wb = await libroExcel();
        hojaExcel(wb, {
          nombre: "Costo MO", titulo, subtitulo: cc.name,
          columnas: [
            { t: "Proyecto", key: "proy", ancho: 18, formato: "texto" },
            { t: "Empleado", key: "emp", ancho: 30, formato: "texto" },
            { t: "Cargo", key: "cargo", ancho: 22, formato: "texto" },
            { t: "Salario mensual", key: "sal", ancho: 15, formato: "lps" },
            { t: "Bonificación mensual", key: "bon", ancho: 15, formato: "lps" },
            { t: "Costo diario (sal+bonif)/30", key: "sd", ancho: 15, formato: "lps" },
            { t: "Días pagados", key: "dias", ancho: 11, formato: "num2" },
            { t: "Costo días", key: "cdias", ancho: 15, formato: "lps" },
            { t: `HE hrs (de ${prevQLabel})`, key: "hehrs", ancho: 12, formato: "num2" },
            { t: "Costo HE", key: "hecosto", ancho: 14, formato: "lps" },
            { t: "Total", key: "total", ancho: 16, formato: "lps" },
          ],
          filas,
          total: { proy: "TOTAL", dias: totalDias, cdias: total - totalHeCosto, hehrs: totalHeHrs, hecosto: totalHeCosto, total },
        });
        await descargarExcel(wb, `CostoMO_${cc.name.replace(/ /g, "_")}_${sheet.quincena}_${sheet.periodo}.xlsx`);
      } catch (err) {
        alert("No se pudo generar el Excel: " + (err?.message || err));
      }
    };

    const exportCostosPDF = () => {
      const w = window.open("", "_blank");
      if (!w) { alert("Permite popups para imprimir"); return; }
      const fL = fmtLps;
      const he = (n, txt) => n > 0 ? `<span style="color:${RP.naranjaTexto}">${txt}</span>` : `<span style="color:${RP.texto3}">—</span>`;
      const pcMO = pastelesDe(rows.map(r => r.short));
      const projBlocks = rows.map(r => `<div>${rSeccionProyecto(pcMO[r.short], `${r.short}${r.code ? ` · ${r.code}` : ""}`,
        rTabla({
          columnas: [{ t: "Empleado" }, { t: "Cargo" }, { t: "Costo diario", num: true }, { t: "Días pag.", num: true }, { t: "Costo días", num: true }, { t: "HE hrs", num: true }, { t: "Costo HE", num: true }, { t: "Total", num: true }],
          filas: r.emps.map(x => [
            `<b>${escHTML(x.emp.fullName)}</b>`, `<span class="suave">${escHTML(x.emp.position || "—")}</span>`,
            fL(x.sd), fmtDias(x.dias), fL(x.costoDias), he(x.heHrs, fmtDias(x.heHrs)), he(x.heCosto, fL(x.heCosto)), `<b>${fL(x.costo)}</b>`,
          ]),
          total: [`Subtotal ${escHTML(r.short)} · ${r.emps.length} persona${r.emps.length !== 1 ? "s" : ""}`, "", "", fmtDias(r.diasPag), fL(r.costoDias), r.heHrs > 0 ? fmtDias(r.heHrs) : "—", r.heCosto > 0 ? fL(r.heCosto) : "—", fL(r.costo)],
        }), `<span class="mono">${fL(r.costo)}</span>`)}</div>`).join("");
      const cuerpo = rKpis([
        { label: "Costo total mano de obra", valor: fL(total) },
        { label: "Días pagados", valor: fmtDias(totalDias) },
        { label: `HE pagadas (de ${prevQLabel})`, valor: fL(totalHeCosto), sub: `${fmtDias(totalHeHrs)} horas`, tono: "naranjaTexto" },
        { label: "Personas", valor: personas },
        { label: "Proyectos", valor: rows.length },
      ])
        + projBlocks
        + rTabla({ columnas: [{ t: "" }, { t: "", num: true }], filas: [], total: [`Costo total mano de obra · ${sheet.quincena} ${sheet.periodo}`, fL(total)] })
        + `<div class="rp-nota" style="margin-top:14px;line-height:1.6">Metodología: costo diario = (salario + bonificación mensual) ÷ 30; costo = costo diario × días pagados atribuidos al proyecto según cuadrilla y reasignaciones diarias (1*). Domingos/feriados de descanso pagan 1 día; domingo trabajado (DT) ×2, domingo triple (DT2) y feriado trabajado (TF) ×3; incapacidad (INC) paga 1 día; NSP no paga.
          Horas extras: hora base = salario ÷ 30 ÷ 8 · 4-7pm ×1.25 · 7-10pm ×1.50 · 10pm-12am ×1.75 · domingo ×2. Las HE mostradas corresponden a las trabajadas en ${prevQLabel}, pagadas en esta quincena (pago quincena vencida).
          No incluye cargas patronales. Fuente: asistencia ${sheet.quincena} ${sheet.periodo}${sheet.lastSaved ? ` (guardada ${fmt(sheet.lastSaved.slice(0, 10))})` : ""}.</div>`;
      abrirReporte(w, reporteHTML({ titulo: "Costo de mano de obra", subtitulo: `${cc.name} · Quincena ${sheet.quincena} ${sheet.periodo}`, empresa: sheet.company || co, cuerpo }));
    };

    // ══════════ REPORTE EJECUTIVO MENSUAL GLOBALIZADO (ago 2026) ══════════
    // Pedido de Gerson: un solo PDF del MES con AMBAS empresas para enviarlo
    // al Dr. Flores. Portada con logo, KPIs y graficas (dona por proyecto +
    // barras por empresa, SVG/divs inline — sin librerias); luego tablas por
    // proyecto donde cada empleado lleva su chip GEO/SUB y los subtotales se
    // desglosan por empresa. Suma 1Q+2Q del mes elegido corriendo el motor
    // calcCostoMO por empresa (misma metodologia y misma regla de HE pagadas
    // quincena vencida: en el mes se desembolsan las HE de 2Q del mes
    // anterior y las de 1Q del propio mes).
    const mesesDisponibles = [...new Set(atts.map(a => a.periodo).filter(Boolean))].sort().reverse();
    const mesEjec = costosMesEjec && mesesDisponibles.includes(costosMesEjec) ? costosMesEjec : (mesesDisponibles[0] || "");
    const exportCostosEjecutivoPDF = () => {
      if (!mesEjec) { alert("Todavía no hay asistencia registrada en ninguna empresa."); return; }
      const [yy, mmn] = mesEjec.split("-").map(Number);
      const mesNombreRaw = new Date(yy, mmn - 1, 1).toLocaleDateString("es-HN", { month: "long", year: "numeric" });
      const mesTitulo = mesNombreRaw.charAt(0).toUpperCase() + mesNombreRaw.slice(1);
      const fL = (n) => "L " + Number(n || 0).toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

      // ── Correr el motor por empresa × quincena y combinar por proyecto ──
      const EMPRESAS = ["geotecnica", "subterra"];
      const TAG = { geotecnica: "GEO", subterra: "SUB" };
      const faltantes = [];
      const porEmp = {};
      const proy = {};
      EMPRESAS.forEach((c) => {
        porEmp[c] = { total: 0, costoDias: 0, heCosto: 0, heHrs: 0, dias: 0, personas: new Set() };
        const empList = emps.filter(e => e.company === c);
        ["1Q", "2Q"].forEach((q) => {
          const sh = atts.find(a => a.company === c && a.periodo === mesEjec && a.quincena === q);
          // Sin la hoja de asistencia se pierden tambien las HE que esa
          // quincena DESEMBOLSA (quincena vencida) — se dice explicito.
          if (!sh) { faltantes.push(`${COMPANIES[c].name}: ${q} sin asistencia registrada (sus días y las HE que esa quincena paga quedan fuera)`); return; }
          const r = calcCostoMO(sh, empList);
          porEmp[c].total += r.total || 0;
          porEmp[c].dias += r.totalDias || 0;
          porEmp[c].heCosto += r.totalHeCosto || 0;
          porEmp[c].heHrs += r.totalHeHrs || 0;
          porEmp[c].costoDias += (r.total || 0) - (r.totalHeCosto || 0);
          (r.rows || []).forEach(row => {
            if (!proy[row.short]) proy[row.short] = { short: row.short, name: row.name, code: row.code, total: 0, costoDias: 0, heCosto: 0, heHrs: 0, dias: 0, porCo: { geotecnica: 0, subterra: 0 }, emps: {} };
            const P = proy[row.short];
            P.total += row.costo; P.costoDias += row.costoDias; P.heCosto += row.heCosto; P.heHrs += row.heHrs; P.dias += row.diasPag;
            P.porCo[c] += row.costo;
            row.emps.forEach(x => {
              porEmp[c].personas.add(x.emp.id);
              const key = `${c}|${x.emp.id}`;
              if (!P.emps[key]) P.emps[key] = { emp: x.emp, co: c, sd: x.sd, dias: 0, costoDias: 0, heHrs: 0, heCosto: 0, costo: 0 };
              const E = P.emps[key];
              E.dias += x.dias; E.costoDias += x.costoDias; E.heHrs += x.heHrs; E.heCosto += x.heCosto; E.costo += x.costo;
            });
          });
        });
      });
      const rowsG = Object.values(proy)
        .map(p => ({ ...p, emps: Object.values(p.emps).sort((a, b) => b.costo - a.costo) }))
        .sort((a, b) => b.total - a.total);
      if (!rowsG.length) { alert(`No hay asistencia registrada en ${mesTitulo} para ninguna de las dos empresas.`); return; }
      const totalG = rowsG.reduce((s, r) => s + r.total, 0);
      const diasG = rowsG.reduce((s, r) => s + r.dias, 0);
      const heCostoG = rowsG.reduce((s, r) => s + r.heCosto, 0);
      const heHrsG = rowsG.reduce((s, r) => s + r.heHrs, 0);
      const costoDiasG = totalG - heCostoG;
      const personasG = new Set([...porEmp.geotecnica.personas, ...porEmp.subterra.personas]).size;
      const w = window.open("", "_blank");
      if (!w) { alert("Permite popups para generar el PDF"); return; }
      // Estilo único de reportes (26-oct-2026): src/reporte-estilo.js
      // Empresas: Geotecnica en carbón, Subterra en naranja (como Compras).
      const COLOR_EMP = { geotecnica: RP.carbon, subterra: RP.naranja };

      // ── Gráfica 1: DONA de distribución del costo por proyecto ──
      const top = rowsG.slice(0, 8);
      const otros = rowsG.slice(8);
      const otrosTot = otros.reduce((s, r) => s + r.total, 0);
      const pcG = pastelesDe(rowsG.map(r => r.short));
      const segs = [
        ...top.map((r) => ({ label: r.short, valor: r.total, valorTxt: fL(r.total), color: pcG[r.short].base })),
        ...(otros.length ? [{ label: `Otros (${otros.length})`, valor: otrosTot, valorTxt: fL(otrosTot), color: RP.lineaFuerte }] : []),
      ];

      // ── Gráfica 2: barras por empresa ──
      const maxEmpTotal = Math.max(porEmp.geotecnica.total, porEmp.subterra.total, 1);
      const barrasEmp = EMPRESAS.map(c => {
        const d = porEmp[c];
        const pct = totalG > 0 ? (d.total / totalG) * 100 : 0;
        return `<div style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;font-size:10.5px;margin-bottom:5px"><b>${esc(COMPANIES[c].name)}</b><span class="mono">${fL(d.total)}</span></div>
          ${rBarra([{ valor: d.total, color: COLOR_EMP[c] }], maxEmpTotal)}
          <div class="rp-nota">${d.personas.size} persona${d.personas.size !== 1 ? "s" : ""} · ${pct.toFixed(1)} % del grupo · días ${fmtDias(d.dias)} (${fL(d.costoDias)}) · HE ${fmtDias(d.heHrs)} hrs (${fL(d.heCosto)})</div>
        </div>`;
      }).join("");

      // ── Gráfica 3: mezcla GEO/SUB por proyecto (barras apiladas, top 10) ──
      const topMix = rowsG.slice(0, 10);
      const maxProy = Math.max(...topMix.map(r => r.total), 1);
      const barrasProy = topMix.map(r => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:10px">
          <span style="width:118px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0">${esc(r.short)}</span>
          <div style="flex:1">${rBarra([{ valor: r.porCo.geotecnica, color: COLOR_EMP.geotecnica }, { valor: r.porCo.subterra, color: COLOR_EMP.subterra }], maxProy)}</div>
          <span class="mono" style="width:96px;text-align:right;font-weight:700;flex-shrink:0">${fL(r.total)}</span>
        </div>`).join("");
      const leyEmp = `<div class="rp-nota" style="display:flex;gap:14px;margin:0 0 8px">${EMPRESAS.map(c => `<span><span style="display:inline-block;width:9px;height:9px;border-radius:3px;background:${COLOR_EMP[c]};vertical-align:-1px"></span> ${esc(COMPANIES[c].name)}</span>`).join("")}</div>`;
      const chipCo = (c) => rChip(TAG[c], c === "subterra" ? "naranja" : "");

      // ── Tablas por proyecto con chip de empresa por empleado ──
      const he = (n, txt) => n > 0 ? `<span style="color:${RP.naranjaTexto}">${txt}</span>` : `<span style="color:${RP.texto3}">—</span>`;
      const projBlocks = rowsG.map(r => rSeccionProyecto(pcG[r.short], `${r.short}${r.code ? ` · ${r.code}` : ""}`,
        rTabla({
          columnas: [{ t: "Empleado" }, { t: "Cargo" }, { t: "Costo diario", num: true }, { t: "Días pag.", num: true }, { t: "Costo días", num: true }, { t: "HE hrs", num: true }, { t: "Costo HE", num: true }, { t: "Total", num: true }],
          filas: r.emps.map(x => [
            `${chipCo(x.co)} <b>${esc(x.emp.fullName)}</b>`, `<span class="suave">${esc(x.emp.position || "—")}</span>`,
            fL(x.sd), fmtDias(x.dias), fL(x.costoDias), he(x.heHrs, fmtDias(x.heHrs)), he(x.heCosto, fL(x.heCosto)), `<b>${fL(x.costo)}</b>`,
          ]),
          total: [`Subtotal ${esc(r.short)} · ${r.emps.length} persona${r.emps.length !== 1 ? "s" : ""}`, "", "", fmtDias(r.dias), fL(r.costoDias), r.heHrs > 0 ? fmtDias(r.heHrs) : "—", r.heCosto > 0 ? fL(r.heCosto) : "—", fL(r.total)],
        }),
        `${[r.porCo.geotecnica > 0 ? `GEO ${fL(r.porCo.geotecnica)}` : "", r.porCo.subterra > 0 ? `SUB ${fL(r.porCo.subterra)}` : ""].filter(Boolean).join(" · ")} · <b class="mono">${fL(r.total)}</b>`)).join("");

      const [pyy, pmm] = [yy, mmn - 1 === 0 ? 12 : mmn - 1];
      const mesAnt = `${mmn - 1 === 0 ? yy - 1 : pyy}-${String(pmm).padStart(2, "0")}`;
      const cuerpo = (faltantes.length ? `<div class="rp-caja" style="background:${RP.tinte};border-color:${RP.tinte};margin-bottom:16px;font-size:10.5px;color:${RP.naranjaTexto}"><b>Datos incompletos:</b> ${faltantes.map(esc).join(" · ")} — los totales reflejan solo lo registrado.</div>` : "")
        + rKpis([
          { label: "Costo total del grupo", valor: fL(totalG), sub: `${personasG} colaboradores · ${rowsG.length} proyectos` },
          { label: "Costo días laborados", valor: fL(costoDiasG), sub: `${fmtDias(diasG)} días pagados` },
          { label: "Horas extras pagadas", valor: fL(heCostoG), sub: `${fmtDias(heHrsG)} horas`, tono: "naranjaTexto" },
          { label: "Geotecnica Soluciones", valor: fL(porEmp.geotecnica.total), sub: `${porEmp.geotecnica.personas.size} personas` },
          { label: "Subterra Honduras", valor: fL(porEmp.subterra.total), sub: `${porEmp.subterra.personas.size} personas` },
        ])
        + `<div class="rp-grid2"><div class="rp-caja">${rSeccion("Distribución del costo por proyecto", rDona(segs, { tam: 150, centro: String(rowsG.length), centroSub: "proyectos" }))}</div>`
        + `<div class="rp-caja">${rSeccion("Costo por empresa", barrasEmp)}${rSeccion("Mezcla de personal por proyecto", leyEmp + barrasProy)}</div></div>`
        + `<div class="rp-salto"></div>`
        + `<div style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${RP.texto3};margin-bottom:4px">Detalle por proyecto · ${esc(mesTitulo)}</div>`
        + `<div class="rp-nota" style="margin:0 0 14px">Cada colaborador con su empresa: ${chipCo("geotecnica")} Geotecnica Soluciones · ${chipCo("subterra")} Subterra Honduras</div>`
        + projBlocks
        + rTabla({ columnas: [{ t: "" }, { t: "", num: true }], filas: [], total: [`Total mano de obra del grupo · ${esc(mesTitulo)}`, fL(totalG)] })
        + `<div class="rp-nota" style="margin-top:14px;line-height:1.6"><b>Metodología:</b> costo diario = (salario + bonificación mensual) ÷ 30 × días pagados. Domingo/feriado de descanso paga 1; DT ×2, DT2/TF ×3; INC/V pagan 1; NSP no paga.
          Horas extras: hora base = salario ÷ 30 ÷ 8 · 4-7pm ×1.25 · 7-10pm ×1.50 · 10pm-12am ×1.75 · domingo ×2 (pago quincena vencida: en ${esc(mesTitulo)} se desembolsan las HE de 2Q ${mesAnt} y las de 1Q ${mesEjec}).
          No incluye cargas patronales. Preparado por ${esc(userName || "Operaciones")}.</div>`;
      abrirReporte(w, reporteHTML({ titulo: "Costo de mano de obra", subtitulo: `Reporte ejecutivo mensual · ${mesTitulo} · ambas empresas`, cuerpo, horizontal: true }));
    };

    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header + selector de quincena + exportar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#2C2A28" }}>💵 Costo de Mano de Obra</div>
          <div style={{ fontSize: 12, color: "#8B847C", marginTop: 2 }}>Por proyecto, según la asistencia registrada de la quincena</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#8B847C", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Quincena</div>
            <select value={sheet.id} onChange={e => setCostosSheetId(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 13, background: "#fff" }}>
              {sheets.map(s => <option key={s.id} value={s.id}>{s.quincena} {s.periodo}</option>)}
            </select>
          </div>
          <Btn variant="ghost" onClick={exportCostosExcel}>📊 Excel</Btn>
          <Btn variant="info" onClick={exportCostosPDF}>📄 Descargar reporte PDF</Btn>
          {/* Reporte EJECUTIVO del MES con ambas empresas (para direccion) */}
          <div style={{ width: 1, alignSelf: "stretch", background: "#E2E8F0", margin: "0 4px" }} />
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#8B847C", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Mes · ambas empresas</div>
            <select value={mesEjec} onChange={e => setCostosMesEjec(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 13, background: "#fff" }}>
              {mesesDisponibles.map(m => {
                const [my, mn] = m.split("-").map(Number);
                const lbl = new Date(my, mn - 1, 1).toLocaleDateString("es-HN", { month: "long", year: "numeric" });
                return <option key={m} value={m}>{lbl.charAt(0).toUpperCase() + lbl.slice(1)}</option>;
              })}
            </select>
          </div>
          <Btn onClick={exportCostosEjecutivoPDF}>🏢 Reporte ejecutivo PDF</Btn>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <StatCard icon="💰" label="Costo total mano de obra" value={fmtL(total)} color="#059669" />
        <StatCard icon="📅" label="Días pagados" value={fmtDias(totalDias)} color="#2563EB" />
        <StatCard icon="⏰" label={hayHe ? `HE pagadas (${fmtDias(totalHeHrs)} hrs · de ${prevQLabel})` : `HE pagadas (de ${prevQLabel} — sin registrar)`} value={fmtL(totalHeCosto)} color="#D97706" />
        <StatCard icon="👥" label="Personas" value={personas} color="#E8762D" />
        <StatCard icon="🏗️" label="Proyectos" value={rows.length} color="#7C3AED" />
      </div>

      {rows.length === 0 && (
        <div style={{ background: "#F8FAFC", border: "1px dashed #CBD5E1", borderRadius: 12, padding: 28, textAlign: "center", color: "#94A3B8", fontSize: 13 }}>
          La hoja {sheet.quincena} {sheet.periodo} todavía no tiene días marcados. Registrá asistencia y volvé acá.
        </div>
      )}

      {/* Tabla por proyecto con detalle expandible por empleado */}
      {rows.map(r => (
        <div key={r.short} style={{ background: "#fff", border: "1px solid #DBD4C8", borderRadius: 12, overflow: "hidden" }}>
          <details>
            <summary style={{ cursor: "pointer", listStyle: "none", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", borderLeft: `4px solid ${cc.color}` }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 800, fontSize: 14, color: cc.color }}>{r.short}</span>
                <span style={{ fontSize: 11, color: "#8B847C" }}>{r.name !== r.short ? r.name : ""}{r.code ? ` · ${r.code}` : ""}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 12, flexWrap: "wrap" }}>
                <span><strong style={{ color: "#E8762D" }}>{r.emps.length}</strong> persona{r.emps.length !== 1 ? "s" : ""}</span>
                <span><strong style={{ color: "#2563EB" }}>{fmtDias(r.diasPag)}</strong> días pag.</span>
                {r.heHrs > 0 && <span title={`Horas extras de ${prevQLabel} pagadas en esta quincena`}><strong style={{ color: "#D97706" }}>{fmtDias(r.heHrs)}</strong> hrs HE · <strong style={{ color: "#D97706" }}>{fmtL(r.heCosto)}</strong></span>}
                <span style={{ fontWeight: 800, fontSize: 15, color: "#059669" }}>{fmtL(r.costo)}</span>
                <span style={{ fontSize: 10, color: "#94A3B8" }}>({total > 0 ? Math.round((r.costo / total) * 100) : 0}%)</span>
                <span style={{ fontSize: 11, color: "#8B847C" }}>▸ detalle</span>
              </div>
            </summary>
            <div style={{ overflowX: "auto", borderTop: "1px solid #F1EBE0" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 780 }}>
                <thead><tr style={{ background: "#FFFBF5" }}>
                  <th style={{ textAlign: "left", padding: "8px 14px", fontSize: 10, fontWeight: 700, color: "#8B847C", textTransform: "uppercase" }}>Empleado</th>
                  <th style={{ textAlign: "left", padding: "8px 14px", fontSize: 10, fontWeight: 700, color: "#8B847C", textTransform: "uppercase" }}>Cargo</th>
                  <th title="(Salario + bonificacion mensual) / 30" style={{ textAlign: "right", padding: "8px 14px", fontSize: 10, fontWeight: 700, color: "#8B847C", textTransform: "uppercase" }}>Costo diario</th>
                  <th style={{ textAlign: "right", padding: "8px 14px", fontSize: 10, fontWeight: 700, color: "#8B847C", textTransform: "uppercase" }}>Días pag.</th>
                  <th style={{ textAlign: "right", padding: "8px 14px", fontSize: 10, fontWeight: 700, color: "#8B847C", textTransform: "uppercase" }}>Costo días</th>
                  <th title={`Horas extras de ${prevQLabel} pagadas en esta quincena`} style={{ textAlign: "right", padding: "8px 14px", fontSize: 10, fontWeight: 700, color: "#8B847C", textTransform: "uppercase" }}>HE hrs</th>
                  <th style={{ textAlign: "right", padding: "8px 14px", fontSize: 10, fontWeight: 700, color: "#8B847C", textTransform: "uppercase" }}>Costo HE</th>
                  <th style={{ textAlign: "right", padding: "8px 14px", fontSize: 10, fontWeight: 700, color: "#8B847C", textTransform: "uppercase" }}>Total</th>
                </tr></thead>
                <tbody>
                  {r.emps.map(x => (
                    <tr key={x.emp.id} style={{ borderTop: "1px solid #F8F2E6" }}>
                      <td style={{ padding: "7px 14px", fontWeight: 600, color: "#2C2A28" }}>{x.emp.fullName}</td>
                      <td style={{ padding: "7px 14px", color: "#8B847C" }}>{x.emp.position || "—"}</td>
                      <td style={{ padding: "7px 14px", textAlign: "right" }}>{fmtL(x.sd)}</td>
                      <td style={{ padding: "7px 14px", textAlign: "right", fontWeight: 700, color: "#2563EB" }}>{fmtDias(x.dias)}</td>
                      <td style={{ padding: "7px 14px", textAlign: "right" }}>{fmtL(x.costoDias)}</td>
                      <td style={{ padding: "7px 14px", textAlign: "right", fontWeight: 700, color: x.heHrs > 0 ? "#D97706" : "#CBD5E1" }}>{x.heHrs > 0 ? fmtDias(x.heHrs) : "—"}</td>
                      <td style={{ padding: "7px 14px", textAlign: "right", color: x.heCosto > 0 ? "#D97706" : "#CBD5E1" }}>{x.heCosto > 0 ? fmtL(x.heCosto) : "—"}</td>
                      <td style={{ padding: "7px 14px", textAlign: "right", fontWeight: 700, color: "#059669" }}>{fmtL(x.costo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      ))}

      {/* Total global */}
      {rows.length > 0 && (
        <div style={{ background: "#ECFDF5", border: "1px solid #6EE7B7", borderRadius: 12, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontWeight: 800, color: "#065F46", fontSize: 15 }}>TOTAL MANO DE OBRA · {sheet.quincena} {sheet.periodo}</span>
          <span style={{ fontWeight: 800, color: "#059669", fontSize: 20 }}>{fmtL(total)}</span>
        </div>
      )}

      <div style={{ fontSize: 10.5, color: "#94A3B8", lineHeight: 1.5 }}>
        Metodología: costo diario = (salario + bonificación mensual) ÷ 30 × días pagados por proyecto (cuadrilla + reasignaciones 1*).
        Domingos/feriados de descanso pagan 1 día · DT ×2 · DT2 y TF ×3 · INC paga 1 · NSP no paga.
        Horas extras: hora base = salario ÷ 30 ÷ 8 · 4-7pm +25% · 7-10pm +50% · 10pm-12am +75% · domingo ×2 — las HE de {prevQLabel} se muestran acá porque se pagan en esta quincena (pago quincena vencida). No incluye cargas patronales.
      </div>
    </div>;
  };

  // ═══════════════════════════════════════════════════════════════════
  // DASHBOARD GERENCIAL (ago 2026) — data real del mes, con selector de
  // mes(es): un mes o varios para comparar (ej. julio vs agosto).
  // ═══════════════════════════════════════════════════════════════════
  // Estadísticas de UN mes desde la data real: hojas de asistencia (hr-atts2),
  // planillas (hr-pays), marcajes GeoClock y el roster de hr-emps5.
  const statsDeMes = (periodo) => {
    // Dedupe por quincena (gana la de lastSaved más reciente): si hr-atts2
    // trae hojas duplicadas de una misma quincena, sin esto el costo MO y
    // los conteos del mes se duplicarían.
    const porQ = {};
    ca.filter(a => a.periodo === periodo).forEach(a => {
      const cur = porQ[a.quincena];
      if (!cur || String(a.lastSaved || a.date || "") > String(cur.lastSaved || cur.date || "")) porQ[a.quincena] = a;
    });
    const sheets = Object.values(porQ);
    const [y, m] = periodo.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const porDia = [];
    let nsp = 0, inc = 0, vac = 0, diasPagados = 0, costoMO = 0;
    const proy = {};
    sheets.forEach(sh => {
      const c = calcCostoMO(sh);
      costoMO += c.total || 0;
      c.rows.forEach(r => { proy[r.short] = (proy[r.short] || 0) + r.costo; });
    });
    for (let d = 1; d <= lastDay; d++) {
      const q = d <= 15 ? "1Q" : "2Q";
      const sh = sheets.find(s => s.quincena === q);
      const dt = new Date(y, m - 1, d);
      if (!sh || dt.getDay() === 0 || esFeriadoQuincena(periodo, d)) { porDia.push({ x: d, y: null }); continue; }
      const dStr = `${periodo}-${String(d).padStart(2, "0")}`;
      let esperados = 0, presentes = 0, conDato = 0;
      ae.forEach(e => {
        if (e.startDate && dStr < e.startDate) return;
        if (fueraPorBaja(e, dStr)) return;
        esperados++;
        const v = (sh.grid || {})[`${e.id}-${d}`] || "";
        if (v) conDato++;
        if (v === "1" || v === "TF" || v === "DT" || v === "DT2" || v === "INC" || v === "V") { presentes++; diasPagados++; }
        if (v === "0") nsp++;
        if (v === "INC") inc++;
        if (v === "V") vac++;
      });
      // Días sin NINGUNA marca (aún no pasan asistencia) no grafican 0% falso.
      porDia.push(conDato === 0 ? { x: d, y: null } : { x: d, y: esperados ? Math.round((presentes / esperados) * 100) : null, sub: `${presentes}/${esperados} presentes` });
    }
    const paysMes = cp.filter(p => p.periodo === periodo);
    const planillaTotal = paysMes.reduce((s, p) => s + (Number(p.total) || 0), 0);
    // Tardanzas GeoClock del mes (solo quincenas cargadas: actual + anterior)
    const marcasMes = Object.values(gcMarks).flat().filter(mk => mk && mk.company === co && String(mk.fecha || "").slice(0, 7) === periodo);
    const tardes = marcasMes.filter(mk => mk.tipo === "entrada" && mk.tarde);
    // Minutos a descontar: contados desde el fin de la tolerancia y desde los
    // campos base del marcaje (no del minTarde viejo guardado en la nube).
    const minTardeDenegados = tardes.reduce((s, mk) => {
      const dec = (gcTardies || []).find(t => t && t.markId === mk.id);
      return dec && dec.estado === "denegada" ? s + minTardeDe(mk.hora, mk.horarioEntrada) : s;
    }, 0);
    const conDatos = porDia.filter(p => p.y !== null);
    const presenciaProm = conDatos.length ? Math.round(conDatos.reduce((s, p) => s + p.y, 0) / conDatos.length) : null;
    // Redondeo a 2 decimales: los acumuladores flotantes muestran polvo
    // (L 277,751.378) si se pasan crudos a fmtL.
    Object.keys(proy).forEach(k => { proy[k] = +proy[k].toFixed(2); });
    return { periodo, lastDay, porDia, nsp, inc, vac, diasPagados, costoMO: +costoMO.toFixed(2), proy, paysMes, planillaTotal: +planillaTotal.toFixed(2), tardes, minTardeDenegados, presenciaProm, tieneAsistencia: sheets.length > 0 };
  };
  const mesLabel = (periodo) => {
    const [y, m] = String(periodo).split("-").map(Number);
    const n = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"][m - 1] || periodo;
    return `${n.charAt(0).toUpperCase()}${n.slice(1)} ${y}`;
  };

  // ── Piezas del rediseño (15-oct-2026): vidrio, títulos y pills ──────────
  // Mismas reglas que el resto de GeoCore: cajitas de vidrio, paleta
  // carbón/naranja/gris, poco texto. Las pills son <span role=button> (no
  // <button>) para que los roles de solo lectura igual puedan navegar.
  const tituloCaja = (txt, der) => <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
    <div style={{ font: "800 15px/1.2 var(--display)", color: CHARCOAL, letterSpacing: "-.01em" }}>{txt}</div>
    {der}
  </div>;
  const cifra = (v, sub, color = CHARCOAL) => <div>
    <div style={{ font: "800 30px/1 var(--display)", color, letterSpacing: "-.02em" }}>{v}</div>
    {sub && <div style={{ font: "500 12px/1.35 var(--sans)", color: "#6E6862", marginTop: 6 }}>{sub}</div>}
  </div>;
  const pista = (opciones) => <div style={{ display: "inline-flex", gap: 3, padding: 3, borderRadius: 12, background: "rgba(44,42,40,.07)", flexWrap: "wrap", maxWidth: "100%" }}>
    {opciones.map(o => <span key={o.k} role="button" title={o.title} onClick={o.onClick} style={{ padding: "7px 12px", borderRadius: 9, background: o.on ? "#fff" : "transparent", boxShadow: o.on ? "0 1px 3px rgba(44,42,40,.14)" : "none", color: o.on ? CHARCOAL : "#6E6862", font: `${o.on ? 800 : 600} 12.5px/1 var(--sans)`, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>{o.label}</span>)}
  </div>;

  // ── Piezas de vidrio compartidas por el hub de Asistencia (23-oct-2026) ──
  const btnH = (label, onClick, { c = CHARCOAL, lleno = false, chico = false, disabled = false, title, key } = {}) => <button key={key} type="button" title={title} onClick={onClick} disabled={disabled}
    style={{ minHeight: chico ? 34 : 42, padding: chico ? "6px 13px" : "9px 18px", borderRadius: 11, border: lleno ? "1px solid transparent" : `1px solid ${c === CHARCOAL ? "rgba(44,42,40,.14)" : c + "55"}`, background: lleno ? c : "rgba(255,255,255,.75)", color: lleno ? "#fff" : c, font: `700 ${chico ? 12.5 : 13.5}px/1 var(--sans)`, cursor: disabled ? "default" : "pointer", opacity: disabled ? .5 : 1, whiteSpace: "nowrap" }}>{label}</button>;
  const TONO_H = { gris: { color: "#6E6862", bg: "rgba(44,42,40,.06)" }, verde: { color: "#177243", bg: "#DCF3E4" }, azul: { color: "#1D5FAF", bg: "#DDE9FA" }, ambar: { color: "#8A5A00", bg: "#FBEFC4" }, naranja: { color: "#A94E16", bg: "rgba(232,118,45,.14)" }, rojo: { color: "#B03024", bg: "rgba(192,57,43,.07)" } };
  const chipH = (txt, tono = "gris", sx) => <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, color: TONO_H[tono].color, background: TONO_H[tono].bg, whiteSpace: "nowrap", ...(sx || {}) }}>{txt}</span>;
  const pillH = (label, on, onClick, key) => <button key={key} type="button" onClick={onClick} aria-pressed={on} style={{ padding: "7px 13px", borderRadius: 999, border: on ? "1px solid transparent" : "1px solid rgba(44,42,40,.12)", background: on ? ORANGE_DARK : "rgba(255,255,255,.7)", color: on ? "#fff" : CHARCOAL, font: "700 12.5px/1 var(--sans)", cursor: "pointer", whiteSpace: "nowrap" }}>{label}</button>;
  const tileH = (v, l, c = CHARCOAL, onClick) => <div className={onClick ? "gt-vidrio gt-vidrio-hover" : "gt-vidrio"} role={onClick ? "button" : undefined} onClick={onClick} style={{ padding: "12px 14px", cursor: onClick ? "pointer" : "default" }}><div style={{ font: "800 24px/1 var(--display)", color: c, letterSpacing: "-.02em" }}>{v}</div><div style={{ fontSize: 11.5, color: "#6E6862", marginTop: 5 }}>{l}</div></div>;
  const IcoH = ({ d, size = 20, color = "currentColor" }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>;
  const CTRL_H = { minHeight: 36, padding: "6px 12px", borderRadius: 11, border: "1px solid rgba(44,42,40,.12)", background: "rgba(255,255,255,.85)", fontSize: 13, fontFamily: "inherit", color: CHARCOAL, outline: "none" };
  const cabeceraSub = (titulo, sub, derecha, volver) => <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
    <button type="button" className="gt-circulo" onClick={volver} aria-label="Atrás" style={{ width: 34, height: 34, fontSize: 15 }}>←</button>
    <div style={{ font: "800 18px/1.2 var(--display)", color: CHARCOAL }}>{titulo}</div>
    {sub && <span style={{ fontSize: 12.5, color: "#6E6862" }}>{sub}</span>}
    <div style={{ flex: 1 }} />{derecha}
  </div>;

  const renderDashboard = () => {
    const tmp = ae.filter(e => e.contractType === "temporary");
    const activos = ae.filter(e => e.status === "active");
    const soon = tmp.filter(e => { const f = finContratoDe(e); return f && e.status === "active" && f.dias >= 0 && f.dias <= 30; });
    const hoy = hoyTegus();
    const mesActual = hoy.slice(0, 7);
    // Últimos 6 meses (la masa salarial sale del roster, así que cualquier mes
    // tiene dato) + los que tengan asistencia/planilla más viejos no hacen falta.
    const meses6 = Array.from({ length: 6 }, (_, i) => { const d = new Date(Number(mesActual.slice(0, 4)), Number(mesActual.slice(5, 7)) - 1 - i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }).reverse();
    const mes = dashMeses[0] && meses6.includes(dashMeses[0]) ? dashMeses[0] : mesActual;
    const st = statsDeMes(mes);
    // Masa salarial del mes por DEPARTAMENTO: salario + bonificación de quien
    // estuvo en la empresa ese mes (entró antes de que terminara y no había
    // salido antes de que empezara). Con hideSalary se cuentan personas.
    const [my, mm] = mes.split("-").map(Number);
    const ini = `${mes}-01`, fin = `${mes}-${String(new Date(my, mm, 0).getDate()).padStart(2, "0")}`;
    const delMes = ae.filter(e => (!e.startDate || e.startDate <= fin) && (e.status === "active" || !e.endDate || e.endDate >= ini));
    const porDepto = {};
    delMes.forEach(e => { const d = e.department || "Sin departamento"; porDepto[d] = (porDepto[d] || 0) + (hideSalary ? 1 : (Number(e.salary) || 0) + (Number(e.bonificacion) || 0)); });
    const deptos = Object.entries(porDepto).sort((a, b) => b[1] - a[1]);
    const masa = deptos.reduce((s, [, v]) => s + v, 0);
    const DEPTO_COLORS = [CHARCOAL, ORANGE, "#8C857D", ORANGE_DARK, "#C9C3BB", "#5C5853", "#F2B48A", "#E4E0DA"];
    const corto = (v) => v >= 1e6 ? `L ${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `L ${Math.round(v / 1e3)}k` : `L ${Math.round(v)}`;
    const proyShorts = Object.keys(st.proy).sort((a, b) => (st.proy[b] || 0) - (st.proy[a] || 0));
    const maxProy = Math.max(1, ...Object.values(st.proy));
    // Asistencia de HOY (GeoClock): marcajes del día en la quincena actual.
    const qHoy = getQuincena(hoy);
    const marksHoy = (gcMarks[`${qHoy.periodo}|${qHoy.quincena}`] || []).filter(mk => mk && mk.company === co && mk.fecha === hoy);
    const entradasHoy = marksHoy.filter(mk => mk.tipo === "entrada");
    const tardesHoy = entradasHoy.filter(mk => mk.tarde);
    const sinMarcarHoy = Math.max(0, activos.length - entradasHoy.length);
    const sinFicha = activos.filter(e => !e.startDate || !e.sexo || !e.horario);
    const tardesPend = Object.values(gcMarks).flat().filter(mk => mk && mk.company === co && mk.tipo === "entrada" && mk.tarde && !(gcTardies || []).some(t => t && t.markId === mk.id && (t.estado === "aprobada" || t.estado === "denegada")));
    const permitidas = nav.map(n => n.id);
    const pendientes = [
      soon.length > 0 && { k: "contracts", n: soon.length, txt: soon.length === 1 ? "contrato vence en 30 días" : "contratos vencen en 30 días", det: soon.slice(0, 3).map(e => e.fullName.split(" ").slice(0, 2).join(" ")).join(" · ") },
      tardesPend.length > 0 && { k: "tardanzas", n: tardesPend.length, txt: tardesPend.length === 1 ? "llegada tarde sin decidir" : "llegadas tarde sin decidir" },
      sinFicha.length > 0 && { k: "employees", n: sinFicha.length, txt: sinFicha.length === 1 ? "ficha incompleta" : "fichas incompletas", det: "fecha de ingreso, sexo u horario" },
    ].filter(Boolean);
    const VID = { padding: isMobile ? 16 : 22, minWidth: 0, display: "flex", flexDirection: "column" };
    const mesCorto = (p) => `${mesLabel(p).split(" ")[0].slice(0, 3)} ${p.slice(2, 4)}`;

    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        {pista(meses6.map(p => ({ k: p, on: p === mes, label: mesCorto(p), onClick: () => setDashMeses([p]) })))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "repeat(3, minmax(0,1fr))", gap: 16, alignItems: "stretch", minHeight: isMobile ? undefined : "min(640px, calc(100vh - 210px))" }}>
        {/* 1 · Masa salarial por departamento */}
        <div className="gt-vidrio gt-sube" style={VID}>
          {tituloCaja(hideSalary ? "Equipo por departamento" : "Masa salarial", <span style={{ font: "500 12px/1 var(--sans)", color: "#A39C92" }}>{mesLabel(mes)}</span>)}
          {cifra(<CuentaArriba valor={grafAnim ? masa : 0} formato={hideSalary ? (v) => `${Math.round(v)}` : fmtL} />, hideSalary ? "personas en el mes" : `salario + bonificación · ${delMes.length} personas`)}
          <div style={{ display: "flex", justifyContent: "center", margin: "20px 0 18px" }}>
            <GTDonut progreso={grafAnim} size={isMobile ? 180 : 210} thickness={isMobile ? 22 : 26} centerLabel={hideSalary ? String(masa) : corto(masa)} centerSub={hideSalary ? "personas" : "al mes"}
              segments={deptos.map(([d, v], i) => ({ value: v, color: DEPTO_COLORS[i % DEPTO_COLORS.length], label: d }))} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {deptos.map(([d, v], i) => <div key={d} style={{ display: "flex", alignItems: "center", gap: 9, font: "500 12.5px/1.2 var(--sans)", color: "#5C5853" }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: DEPTO_COLORS[i % DEPTO_COLORS.length], flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d}</span>
              <b style={{ color: CHARCOAL }}>{hideSalary ? v : fmtL(v).replace(/\.\d\d$/, "")}</b>
              <span style={{ color: "#A39C92", minWidth: 34, textAlign: "right" }}>{masa ? Math.round(v / masa * 100) : 0}%</span>
            </div>)}
          </div>
        </div>

        {/* 2 · Mano de obra por proyecto */}
        <div className="gt-vidrio gt-sube" style={{ ...VID, animationDelay: "60ms" }}>
          {tituloCaja("Por proyecto", <span style={{ font: "500 12px/1 var(--sans)", color: "#A39C92" }}>{mesLabel(mes)}</span>)}
          {cifra(hideSalary ? <CuentaArriba valor={grafAnim ? st.diasPagados || 0 : 0} formato={(v) => `${Math.round(v)} días`} /> : st.costoMO > 0 ? <CuentaArriba valor={grafAnim ? st.costoMO : 0} formato={fmtL} /> : "—", hideSalary ? "días pagados en el mes" : "mano de obra: asistencia + horas extras")}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20, flex: 1 }}>
            {proyShorts.length === 0 && <div style={{ fontSize: 13, color: "#A39C92" }}>Sin asistencia registrada en {mesLabel(mes).toLowerCase()}.</div>}
            {proyShorts.slice(0, 10).map((shrt, ip) => <div key={shrt}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, font: "600 12px/1.2 var(--sans)", marginBottom: 5 }}>
                <span style={{ color: CHARCOAL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{shrt}</span>
                {!hideSalary && <span style={{ color: "#5C5853", fontWeight: 700, flexShrink: 0 }}>{fmtL(st.proy[shrt] || 0).replace(/\.\d\d$/, "")}</span>}
              </div>
              <div style={{ height: 7, borderRadius: 4, background: "rgba(44,42,40,.06)", overflow: "hidden" }}>
                <div style={{ width: `${grafAnim ? Math.min(100, ((st.proy[shrt] || 0) / maxProy) * 100) : 0}%`, height: "100%", borderRadius: 4, background: CHARCOAL, transition: `width ${ANIM_GRAF} ${ip * 80}ms` }} />
              </div>
            </div>)}
            {proyShorts.length > 10 && <div style={{ fontSize: 11.5, color: "#A39C92" }}>+{proyShorts.length - 10} proyectos más en Costos</div>}
          </div>
        </div>

        {/* 3 · Hoy + pendientes */}
        <div className="gt-vidrio gt-sube" style={{ ...VID, animationDelay: "120ms" }}>
          {tituloCaja("Hoy", <span style={{ font: "500 12px/1 var(--sans)", color: "#A39C92" }}>{fmt(hoy)}</span>)}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <GTDonut progreso={grafAnim} size={118} thickness={14} centerLabel={String(entradasHoy.length)} centerSub="marcaron"
              segments={[
                { value: entradasHoy.length - tardesHoy.length, color: CHARCOAL, label: "A tiempo" },
                { value: tardesHoy.length, color: ORANGE, label: "Tarde" },
                { value: sinMarcarHoy, color: "#DAD5CE", label: "Sin marcar" },
              ]} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8, font: "500 12.5px/1 var(--sans)", color: "#5C5853" }}>
              {[["A tiempo", entradasHoy.length - tardesHoy.length, CHARCOAL], ["Tarde", tardesHoy.length, ORANGE], ["Sin marcar", sinMarcarHoy, "#DAD5CE"]].map(([l, v, c]) => <span key={l} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />{l} <b style={{ color: CHARCOAL }}>{v}</b>
              </span>)}
            </div>
          </div>
          <div style={{ borderTop: "1px solid rgba(44,42,40,.07)", marginTop: 18, paddingTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="gt-label" style={{ color: "#A39C92", fontSize: 9 }}>Pendientes</div>
            {pendientes.length === 0 && <div style={{ display: "flex", alignItems: "center", gap: 8, font: "600 13px/1.3 var(--sans)", color: "#3E8E5A" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3E8E5A" }} />Todo al día</div>}
            {pendientes.map(p => {
              const ir = tieneSec(p.k);
              return <div key={p.k} role={ir ? "button" : undefined} onClick={ir ? () => irA(p.k) : undefined} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 14, background: "rgba(232,118,45,.07)", cursor: ir ? "pointer" : "default" }}>
                <span style={{ font: "800 20px/1 var(--display)", color: ORANGE_DARK, minWidth: 22 }}>{p.n}</span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", font: "600 12.5px/1.3 var(--sans)", color: CHARCOAL }}>{p.txt}</span>
                  {p.det && <span style={{ display: "block", font: "400 11px/1.3 var(--sans)", color: "#6E6862", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.det}</span>}
                </span>
                {ir && <span style={{ color: "#A39C92" }}>→</span>}
              </div>;
            })}
          </div>
        </div>
      </div>
    </div>;
  };

  // ═══════════════════════════════════════════════════════════════════
  // KPI's (rediseño 15-oct-2026): 5 cajitas de vidrio con lo que más
  // importa + 2 tarjetas (masa salarial del año y estructura del equipo).
  // ═══════════════════════════════════════════════════════════════════
  const renderKpis = () => {
    const hoy = hoyTegus();
    const mesActual = hoy.slice(0, 7);
    const mes = kpisMes || mesActual;
    const [ky, km] = mes.split("-").map(Number);
    const moverMes = (delta) => {
      const d = new Date(ky, km - 1 + delta, 1);
      setKpisMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    };
    const activos = ae.filter(e => e.status === "active");
    const st = statsDeMes(mes);
    const masaRoster = activos.reduce((s, e) => s + (Number(e.salary) || 0) + (Number(e.bonificacion) || 0), 0);
    const masaMes = st.planillaTotal > 0 ? st.planillaTotal : masaRoster;
    const masaEsReal = st.planillaTotal > 0;
    const prevD = new Date(ky, km - 2, 1);
    const mesPrev = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, "0")}`;
    const planillaPrev = cp.filter(p => p.periodo === mesPrev).reduce((s, p) => s + (Number(p.total) || 0), 0);
    const deltaMasa = masaEsReal && planillaPrev > 0 ? ((st.planillaTotal - planillaPrev) / planillaPrev) * 100 : null;
    const ausentismo = (st.nsp + st.diasPagados) > 0 ? (st.nsp / (st.nsp + st.diasPagados)) * 100 : 0;
    const anio = String(ky);
    const bajasAnio = cmov.filter(mv => mv.tipo === "baja" && String(mv.date || "").slice(0, 4) === anio);
    const rotacion = activos.length > 0 ? (bajasAnio.length / activos.length) * 100 : 0;
    const conIngreso = activos.filter(e => e.startDate);
    const antProm = conIngreso.length ? conIngreso.reduce((s, e) => s + (Date.now() - new Date(e.startDate).getTime()), 0) / conIngreso.length / (365.25 * 86400000) : null;
    const mujeres = activos.filter(e => e.sexo === "femenino").length;
    const hombres = activos.filter(e => e.sexo === "masculino").length;
    const conSexo = mujeres + hombres;
    const nPerm = activos.filter(e => e.contractType === "permanent").length;
    const nTemp = activos.filter(e => e.contractType === "temporary").length;
    const nHon = activos.filter(e => e.contractType === "honorarios").length;
    const mesesAnio = Array.from({ length: 12 }, (_, i) => `${anio}-${String(i + 1).padStart(2, "0")}`);
    const barsAnio = mesesAnio.map(p => {
      const real = cp.filter(x => x.periodo === p).reduce((s, x) => s + (Number(x.total) || 0), 0);
      return { key: p, label: "EFMAMJJASOND"[Number(p.slice(5, 7)) - 1], title: mesLabel(p), value: real > 0 ? real : masaRoster, real: real > 0, top: `${Math.round((real > 0 ? real : masaRoster) / 1000)}k` };
    });
    const porDepto = {};
    activos.forEach(e => { const d = e.department || "Sin depto"; porDepto[d] = (porDepto[d] || 0) + 1; });
    const deptoRows = Object.entries(porDepto).sort((a, b) => b[1] - a[1]);
    const DEPTO_COLORS = [CHARCOAL, ORANGE, "#8C857D", ORANGE_DARK, "#C9C3BB", "#5C5853", "#F2B48A", "#E4E0DA"];
    const kpi = (label, valor, sub, i, acento) => <div key={label} className="gt-vidrio gt-sube" style={{ padding: isMobile ? "14px 16px" : "18px 20px", minWidth: 0, animationDelay: `${i * 50}ms` }}>
      <div className="gt-label" style={{ color: "#6E6862", fontSize: 9 }}>{label}</div>
      <div style={{ font: `800 ${isMobile ? 24 : 28}px/1 var(--display)`, color: acento || CHARCOAL, letterSpacing: "-.02em", marginTop: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{valor}</div>
      <div style={{ font: "500 12px/1.35 var(--sans)", color: "#6E6862", marginTop: 7 }}>{sub}</div>
    </div>;
    const sinDec = (v) => fmtL(v).replace(/\.\d\d$/, "");
    const kpis = [
      ["Colaboradores", activos.length, (v) => `${Math.round(v)}`, `${nPerm} permanentes · ${nTemp} temporales${nHon ? ` · ${nHon} hon.` : ""}`],
      hideSalary
        ? ["Antigüedad", antProm || 0, (v) => antProm !== null ? `${v.toFixed(1)} años` : "—", "promedio del equipo"]
        : ["Masa salarial", masaMes, sinDec, masaEsReal ? (deltaMasa !== null ? `planilla real · ${deltaMasa >= 0 ? "+" : ""}${deltaMasa.toFixed(1)}% vs mes anterior` : "planilla real del mes") : "proyección con el roster"],
      ["Ausentismo", ausentismo, (v) => `${v.toFixed(1)}%`, `${st.nsp} día${st.nsp === 1 ? "" : "s"} sin presentarse (NSP)`, ausentismo >= 5 ? "#B03024" : null],
      ["Tardanzas", st.tardes.length, (v) => `${Math.round(v)}`, st.minTardeDenegados > 0 ? `${st.minTardeDenegados} min a descontar` : "llegadas tarde del mes", st.tardes.length ? ORANGE_DARK : null],
      [`Rotación ${anio}`, rotacion, (v) => `${v.toFixed(1)}%`, `${bajasAnio.length} baja${bajasAnio.length === 1 ? "" : "s"} en el año`],
    ];

    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: 3, borderRadius: 12, background: "rgba(44,42,40,.07)" }}>
          <span role="button" aria-label="Mes anterior" onClick={() => moverMes(-1)} style={{ padding: "7px 12px", borderRadius: 9, cursor: "pointer", color: "#5C5853", font: "800 14px/1 var(--sans)", userSelect: "none" }}>‹</span>
          <span style={{ padding: "7px 14px", borderRadius: 9, background: "#fff", boxShadow: "0 1px 3px rgba(44,42,40,.14)", font: "800 12.5px/1 var(--sans)", color: CHARCOAL, minWidth: 110, textAlign: "center" }}>{mesLabel(mes)}</span>
          <span role="button" aria-label="Mes siguiente" onClick={() => moverMes(1)} style={{ padding: "7px 12px", borderRadius: 9, cursor: "pointer", color: "#5C5853", font: "800 14px/1 var(--sans)", userSelect: "none" }}>›</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0,1fr))" : "repeat(5, minmax(0,1fr))", gap: 14 }}>
        {kpis.map((k, i) => kpi(k[0], <CuentaArriba valor={grafAnim ? k[1] : 0} formato={k[2]} />, k[3], i, k[4]))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile || hideSalary ? "minmax(0,1fr)" : "minmax(0,1.6fr) minmax(0,1fr)", gap: 16 }}>
        {!hideSalary && <div className="gt-vidrio gt-sube" style={{ padding: isMobile ? 16 : 20, minWidth: 0, animationDelay: "250ms" }}>
          {tituloCaja(`Masa salarial ${anio}`, <span style={{ display: "flex", gap: 12, font: "600 11.5px/1 var(--sans)", color: "#6E6862" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: ORANGE }} />Planilla real</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "#CFCAC3" }} />Proyección</span>
          </span>)}
          <GTMonthBars progreso={grafAnim} data={barsAnio} fmtVal={fmtL} selected={mes} onPick={(d) => setKpisMes(d.key)} />
        </div>}
        <div className="gt-vidrio gt-sube" style={{ padding: isMobile ? 16 : 20, minWidth: 0, animationDelay: "300ms" }}>
          {tituloCaja("El equipo", conSexo < activos.length && <span style={{ font: "500 11.5px/1 var(--sans)", color: "#A39C92" }}>{activos.length - conSexo} sin sexo en la ficha</span>)}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[["Hombres", hombres, CHARCOAL], ["Mujeres", mujeres, ORANGE_DARK]].map(([l, n, c]) => <div key={l} style={{ borderRadius: 16, background: "rgba(44,42,40,.04)", padding: "14px 16px" }}>
              <div style={{ font: "800 26px/1 var(--display)", color: c }}><CuentaArriba valor={grafAnim && conSexo ? n / conSexo * 100 : 0} formato={(v) => `${Math.round(v)}%`} /></div>
              <div style={{ font: "500 12px/1 var(--sans)", color: "#6E6862", marginTop: 7 }}>{l} · {n}</div>
            </div>)}
          </div>
          {deptoRows.length > 0 && <>
            <div className="gt-label" style={{ color: "#A39C92", fontSize: 9, margin: "18px 0 8px" }}>Por departamento</div>
            <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", gap: 2 }}>
              {deptoRows.map(([dep, n], i) => <div key={dep} title={`${dep}: ${n}`} style={{ width: `${grafAnim ? (n / activos.length) * 100 : 0}%`, background: DEPTO_COLORS[i % DEPTO_COLORS.length], transition: `width ${ANIM_GRAF} ${i * 90}ms` }} />)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 12 }}>
              {deptoRows.map(([dep, n], i) => <div key={dep} style={{ display: "flex", alignItems: "center", gap: 8, font: "500 12.5px/1 var(--sans)", color: "#5C5853" }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: DEPTO_COLORS[i % DEPTO_COLORS.length] }} />
                <span style={{ flex: 1 }}>{dep}</span><b style={{ color: CHARCOAL }}>{n}</b><span style={{ color: "#A39C92", minWidth: 36, textAlign: "right" }}>{Math.round(n / activos.length * 100)}%</span>
              </div>)}
            </div>
          </>}
        </div>
      </div>
    </div>;
  };

  // ═══════════════════════════════════════════════════════════════════
  // EMPLEADOS (rediseño 15-oct-2026): carnets de vidrio. Click = el carnet
  // sale a la pantalla, se voltea y el DORSO trae toda la ficha.
  // ═══════════════════════════════════════════════════════════════════
  const renderEmps = () => {
    const q = (empSearch || "").trim().toLowerCase();
    const base = ce.filter((e) => {
      if (empDeptFilter && e.department !== empDeptFilter) return false;
      if (!q) return true;
      const hay = [e.fullName, e.dni, e.position, e.department, e.email, e.phone, genEmpCode(e.fullName, e.dni)]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
    const porTipo = (t) => base.filter(e => e.contractType === t);
    const filtered = empTipo === "todos" ? base : porTipo(empTipo);
    const deptSet = new Set(DEPARTMENTS);
    ce.forEach(e => { if (e.department) deptSet.add(e.department); });
    const deptOptions = [...deptSet].sort();
    const abrir = (ev, e) => {
      const r = ev.currentTarget.getBoundingClientRect();
      setCarnet({ id: e.id, rect: { left: r.left, top: r.top, width: r.width, height: r.height } });
    };
    const carnetDe = (e, i) => <div key={e.id} role="button" tabIndex={0} className="gt-vidrio gt-vidrio-hover gt-sube"
      onClick={(ev) => abrir(ev, e)} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); abrir(ev, e); } }}
      aria-label={`Ver la ficha de ${e.fullName}`}
      style={{ height: 268, borderRadius: 22, cursor: "pointer", overflow: "hidden", opacity: e.status === "active" ? 1 : 0.62, visibility: carnet?.id === e.id ? "hidden" : "visible", animationDelay: `${Math.min(i, 12) * 25}ms` }}>
      <CarnetFrente e={e} foto={e.photo?.fileId ? photoCache[e.photo.fileId] : null} empresa={co === "subterra" ? "Subterra" : "Geotecnica"} />
    </div>;
    const grid = (rows) => <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 158 : 210}px, 1fr))`, gap: isMobile ? 10 : 16 }}>
      {rows.map((e, i) => carnetDe(e, i))}
    </div>;
    const grupos = [["permanent", "Permanentes"], ["temporary", "Temporales"], ["honorarios", "Honorarios"]];
    const SEL = { padding: "10px 12px", border: "1px solid rgba(44,42,40,.1)", borderRadius: 12, fontSize: 13, background: "rgba(255,255,255,.75)", color: CHARCOAL, outline: "none", fontFamily: "inherit" };

    return <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="gt-vidrio" style={{ padding: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 240px", minWidth: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A39C92" strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input type="search" placeholder="Buscar por nombre, DNI, cargo o código" value={empSearch} onChange={e => setEmpSearch(e.target.value)} style={{ ...SEL, width: "100%", boxSizing: "border-box", paddingLeft: 38 }} />
        </div>
        <select value={empDeptFilter} onChange={e => setEmpDeptFilter(e.target.value)} style={SEL}>
          <option value="">Todos los departamentos</option>
          {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        {pista([["todos", `Todos ${base.length}`], ...grupos.filter(([k]) => porTipo(k).length || empTipo === k).map(([k, l]) => [k, `${l} ${porTipo(k).length}`])].map(([k, label]) => ({ k, label, on: empTipo === k, onClick: () => setEmpTipo(k) })))}
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <span role="button" title="Volver a leer de la nube" aria-label="Actualizar" className="gt-circulo" onClick={async () => { if (refreshing) return; setRefreshing(true); try { await loadAll(); } finally { setRefreshing(false); } }} style={{ width: 40, height: 40, fontSize: 16, opacity: refreshing ? .5 : 1 }}>↻</span>
          {!isPhotoOnly && !isReadOnly && <button className="gt-btn gt-btn-primario" onClick={() => setModal({ t: "en" })} style={{ minHeight: 40, padding: "10px 18px", fontSize: 13.5 }}>+ Nuevo</button>}
        </div>
      </div>

      {empsLoadWarning && <div style={{ background: "rgba(192,57,43,.07)", borderRadius: 14, padding: "12px 16px", fontSize: 13, color: "#B03024" }}>
        <b>No se pudieron cargar los empleados desde la nube.</b> Tocá ↻ para reintentar y no agregues ni edites hasta que cargue la lista.
      </div>}

      {empTipo === "todos"
        ? grupos.map(([k, l]) => { const rows = filtered.filter(e => e.contractType === k); return rows.length > 0 && <div key={k}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "4px 2px 12px" }}>
              <span style={{ font: "800 16px/1 var(--display)", color: CHARCOAL }}>{l}</span>
              <span style={{ font: "600 13px/1 var(--sans)", color: "#A39C92" }}>{rows.length}</span>
            </div>
            {grid(rows)}
          </div>; })
        : grid(filtered)}

      {filtered.length === 0 && <div className="gt-vidrio" style={{ padding: 40, textAlign: "center", color: "#6E6862", fontSize: 13.5 }}>
        {ce.length === 0 ? `Sin colaboradores en ${cc.name}` : "Nadie coincide con la búsqueda"}
      </div>}
    </div>;
  };

  // Dorso del carnet: TODA la ficha. Se monta fuera del <fieldset disabled>
  // (portal), así que los permisos se revisan acá: editar = no solo-lectura;
  // eliminar = igual que antes (ni el visor de fotos ni Ana).
  const renderCarnet = () => {
    if (!carnet) return null;
    const e = emps.find(x => x.id === carnet.id);
    if (!e) return null;
    const foto = e.photo?.fileId ? photoCache[e.photo.fileId] : null;
    const empresa = e.company === "subterra" ? "Subterra" : "Geotecnica";
    const fin = finContratoDe(e);
    const antig = e.startDate ? (Date.now() - new Date(`${e.startDate}T12:00:00`).getTime()) / (365.25 * 86400000) : null;
    const puedeEditar = !isReadOnly;
    const puedeBorrar = !isReadOnly && !isPhotoOnly && !isAnaRH;
    const fila = (l, v) => v ? <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "8px 0", borderBottom: "1px solid rgba(44,42,40,.06)" }}>
      <span style={{ font: "500 12.5px/1.3 var(--sans)", color: "#6E6862", flexShrink: 0 }}>{l}</span>
      <span style={{ font: "600 13px/1.3 var(--sans)", color: CHARCOAL, textAlign: "right", minWidth: 0, wordBreak: "break-word" }}>{v}</span>
    </div> : null;
    const bloque = (t, filas) => filas.some(Boolean) && <div style={{ marginTop: 16 }}>
      <div className="gt-label" style={{ color: ORANGE_DARK, fontSize: 9, marginBottom: 4 }}>{t}</div>
      {filas}
    </div>;
    return <CarnetVolteo origen={carnet.rect} onCerrado={() => setCarnet(null)}
      frente={<CarnetFrente e={e} foto={foto} empresa={empresa} grande />}
      dorso={(cerrar) => <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ position: "relative", flexShrink: 0, background: "linear-gradient(135deg,#2C2A28 0%,#3A3633 100%)", padding: "16px 18px", display: "flex", alignItems: "center", gap: 12 }}>
          {CURVAS_CARNET}
          <EmpAvatar name={e.fullName} dataUrl={foto} size={52} borderRadius={14} style={{ position: "relative", border: "2px solid rgba(255,255,255,.9)" }} />
          <div style={{ position: "relative", minWidth: 0, flex: 1 }}>
            <div style={{ font: "800 16px/1.2 var(--display)", color: "#fff" }}>{e.fullName}</div>
            <div style={{ font: "500 12px/1.3 var(--sans)", color: "rgba(255,255,255,.7)", marginTop: 3 }}>{e.position || "Sin cargo"} · <span style={{ fontFamily: "var(--mono)", color: "#F2B48A" }}>{genEmpCode(e.fullName, e.dni)}</span></div>
          </div>
          <button onClick={cerrar} aria-label="Cerrar" style={{ position: "relative", width: 34, height: 34, borderRadius: "50%", border: "none", background: "rgba(255,255,255,.14)", color: "#fff", fontSize: 16, cursor: "pointer", flexShrink: 0 }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 20px 16px" }}>
          {bloque("Trabajo", [
            fila("Empresa", COMPANIES[e.company]?.name),
            fila("Departamento", e.department),
            fila("Contrato", CT_LABEL[e.contractType]),
            fila("Estado", e.status === "active" ? "Activo" : "Inactivo"),
            fila("Ingreso", e.startDate ? fmt(e.startDate) : null),
            fila(e.status === "active" ? "Fin de contrato" : "Último día", e.endDate && e.contractType !== "permanent" ? `${fmt(e.endDate)}${fin && e.status === "active" ? ` · ${fin.txt.toLowerCase()}` : ""}` : (e.status !== "active" && e.endDate ? fmt(e.endDate) : null)),
            fila("Antigüedad", antig !== null && antig >= 0 ? (antig < 1 ? `${Math.max(1, Math.round(antig * 12))} meses` : `${antig.toFixed(1)} años`) : null),
            fila("Horario", horarioDe(e).label + (e.noMarca ? " · no marca" : "")),
          ])}
          {bloque("Identidad", [fila("DNI", e.dni), fila("Sexo", e.sexo === "femenino" ? "Femenino" : e.sexo === "masculino" ? "Masculino" : null)])}
          {bloque("Contacto", [fila("Teléfono", e.phone), fila("Correo", e.email)])}
          {!hideSalary && bloque("Salario", [fila("Salario mensual", Number(e.salary) ? fmtL(e.salary) : null), fila("Bonificación", Number(e.bonificacion) ? fmtL(e.bonificacion) : null)])}
          {(() => { const t = vacacionesTomadas(vacs, e.id, hoyISO().slice(0, 4)); return bloque("Vacaciones tomadas", [
            fila("Este año", `${t.diasAnio} día${t.diasAnio === 1 ? "" : "s"}`),
            ...t.lista.slice(0, 4).map(v => fila(String(v.startDate).slice(0, 4), `${rangoCortoHub(v.startDate, v.endDate)} · ${v.days} d`)),
            t.lista.length === 0 ? fila("Historial", "Sin vacaciones registradas") : null,
          ]); })()}
          <div style={{ marginTop: 16 }}><EquipoAsignadoInv empId={e.id} /></div>
        </div>
        {(puedeEditar || puedeBorrar) && <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderTop: "1px solid rgba(44,42,40,.07)", background: "rgba(249,249,248,.9)" }}>
          {puedeBorrar && <button onClick={() => { if (!confirm(`¿Eliminar a ${e.fullName} de ${COMPANIES[e.company]?.name}?\n\nSe borra su ficha completa. Para una salida normal usá la baja en Movimientos.`)) return; sE(emps.filter(x => x.id !== e.id)); setCarnet(null); }} style={{ border: "none", background: "transparent", color: "#B03024", font: "600 12.5px/1 var(--sans)", cursor: "pointer", padding: "8px 4px" }}>Eliminar</button>}
          {puedeEditar && <button className="gt-btn gt-btn-primario" onClick={() => { setCarnet(null); setModal({ t: "ee", d: e }); }} style={{ marginLeft: "auto", minHeight: 40, padding: "10px 20px", fontSize: 13.5 }}>Editar ficha</button>}
        </div>}
      </div>} />;
  };

  // ═══════════════════════════════════════════════════════════════════════
  // PLANILLA (16-oct-2026): la Lic. Carolina la genera ACÁ, ya no en Excel.
  // La asistencia dicta los días (NSP, feriados, domingos, llegadas tarde
  // denegadas), las deducciones de ley salen solas en la 2Q, las horas
  // extras de la quincena ANTERIOR entran como ingreso (quincena vencida),
  // y cada línea admite ingresos / deducciones extra con su concepto.
  // Lógica pura en planilla-calc.js (probada); PDF y Excel en planilla-export.
  // ═══════════════════════════════════════════════════════════════════════
  const puedePlanilla = userRole === "admin" || userRole === "tesoreria";
  const planillasEmpresa = cp.slice().sort((a, b) => `${b.periodo}-${b.quincena}`.localeCompare(`${a.periodo}-${a.quincena}`));
  // Sugerencia: la más RECIENTE entre "la que sigue a la última planilla" y
  // "la última quincena con asistencia registrada" — así la primera vez
  // propone la asistencia más nueva (1Q oct) y después va de corrido, sin
  // volver a quincenas viejas que ya se pagaron por Excel.
  const quincenaSugerida = () => {
    const clave = (q) => `${q.periodo}-${q.quincena}`;
    const candidatas = [];
    const ultima = planillasEmpresa[0];
    if (ultima) candidatas.push(quincenaSiguiente(ultima.periodo, ultima.quincena));
    const asist = ca.slice().sort((x, y) => clave(y).localeCompare(clave(x)))[0];
    if (asist) candidatas.push({ periodo: asist.periodo, quincena: asist.quincena });
    if (!candidatas.length) { const hoy = hoyTegus(); return { periodo: hoy.slice(0, 7), quincena: Number(hoy.slice(8, 10)) <= 15 ? "1Q" : "2Q" }; }
    return candidatas.sort((x, y) => clave(y).localeCompare(clave(x)))[0];
  };

  // Genera las líneas desde la asistencia + HE de la quincena anterior.
  const generarLineasPlanilla = async (periodo, quincena) => {
    const q = diasDeQuincena(periodo, quincena);
    if (!q) return null;
    const attSheet = ca.find(a => a.periodo === periodo && a.quincena === quincena) || null;
    const cuad = cq.find(x => x.periodo === periodo && x.quincena === quincena) || null;
    const prev = quincenaAnteriorPl(periodo, quincena);
    const heSheet = che.find(h => h.periodo === prev.periodo && h.quincena === prev.quincena) || null;
    // Hoja anterior: una incapacidad que viene de ella sigue contando sus días.
    const attPrev = ca.find(a => a.periodo === prev.periodo && a.quincena === prev.quincena) || null;
    const ovr = Object.fromEntries(Object.entries(attSheet?.projOverrides || {}).map(([k, v]) => [k, resolveShortHR(v)]));
    const lines = ce.filter(e => entraEnPlanilla(e, periodo, quincena)).map(emp => {
      const baseProj = resolveShortHR(cuad?.assignments?.[emp.id] || emp.project || "") || "";
      const incPrevias = rachaIncapAlCierre(emp, prev.periodo, prev.quincena, { grid: attPrev?.grid, esFeriado: (d) => esFeriadoQuincena(prev.periodo, d) });
      const asistencia = asistenciaDe(emp, periodo, quincena, { grid: attSheet?.grid, arrivalTimes: attSheet?.arrivalTimes, projOverrides: ovr, baseProj, esFeriado: (d) => esFeriadoQuincena(periodo, d), fueraPorBaja, horaLimite: horaLimiteH, incPrevias });
      asistencia.baseProj = baseProj;
      const he = horasExtrasDe(heSheet, emp.id, heHoraBase(emp));
      return armarLinea({ emp, periodo, quincena, asistencia, he, bonosExtra: monthlyBonusFor(emp.id, q.inicio, q.fin) });
    });
    const orden = { permanent: 0, temporary: 1, honorarios: 2 };
    lines.sort((a, b) => (orden[a.ct] ?? 9) - (orden[b.ct] ?? 9) || String(a.name).localeCompare(String(b.name), "es", { sensitivity: "base" }));
    // Llegadas tarde SIN DECIDIR de esta quincena (se pagan día completo).
    let tardesPend = [];
    try {
      const [mks, tds] = await Promise.all([store.getCloud(gcMarkKey(periodo, quincena)), store.getCloud("gc-tardies")]);
      const decididas = new Set((Array.isArray(tds) ? tds : []).filter(t => t && (t.estado === "aprobada" || t.estado === "denegada")).map(t => t.markId));
      tardesPend = (Array.isArray(mks) ? mks : []).filter(mk => mk && mk.company === co && mk.tipo === "entrada" && mk.tarde && !decididas.has(mk.id)).map(mk => `${mk.empNombre || "?"} · ${fmt(mk.fecha)}`);
    } catch { tardesPend = null; }
    return { lines, heDe: heSheet ? { periodo: prev.periodo, quincena: prev.quincena } : null, heFaltante: !heSheet ? prev : null, sinAsistencia: !attSheet, sinCuadrilla: !cuad, tardesPend };
  };

  const nuevaPlanilla = async (periodo, quincena) => {
    const existe = cp.find(p => p.periodo === periodo && p.quincena === quincena);
    if (existe) { abrirPlanilla(existe); return; }
    setPayBusy(true);
    try {
      const g = await generarLineasPlanilla(periodo, quincena);
      if (!g) return;
      setPayDraft({ id: uid(), company: co, periodo, quincena, estado: "borrador", date: new Date().toISOString(), createdBy: userName, version: 3, ...g });
      setPayAbiertos({}); setPayQ(""); setPayGrupo("todos"); setPayParte("salarios"); setPayVista("editor");
    } finally { setPayBusy(false); }
  };
  const abrirPlanilla = (p) => {
    setPayDraft({ ...p, lines: (p.lines || []).map(l => ({ ...l, extras: Array.isArray(l.extras) ? l.extras : [] })) });
    setPayAbiertos({}); setPayQ(""); setPayGrupo("todos"); setPayParte("salarios"); setPayVista("editor");
  };
  // Vuelve a leer asistencia y HE, conservando lo que se tocó a mano.
  const regenerarPlanilla = async () => {
    const d = payDraft; if (!d) return;
    if (!confirm("¿Volver a leer la asistencia y las horas extras?\n\nSe conservan los ingresos y deducciones extra, el ISR, las notas y el método de pago que ya pusiste.")) return;
    setPayBusy(true);
    try {
      const g = await generarLineasPlanilla(d.periodo, d.quincena);
      if (!g) return;
      const prev = Object.fromEntries((d.lines || []).map(l => [l.eid, l]));
      g.lines = g.lines.map(l => { const p = prev[l.eid]; return p ? { ...l, extras: p.extras || [], nota: p.nota || "", isr: l.aplicaLey ? (p.isr ?? l.isr) : l.isr, metodoPago: p.metodoPago || l.metodoPago } : l; });
      setPayDraft({ ...d, ...g });
    } finally { setPayBusy(false); }
  };
  const upLinea = (id, fn) => setPayDraft(d => ({ ...d, lines: d.lines.map(l => l.id === id ? fn(l) : l) }));

  // Guardado robusto: getCloud → reemplazar por id → set → verify.
  const guardarPlanilla = async (estado) => {
    const d = payDraft; if (!d) return false;
    const r = resumenPlanilla(d.lines);
    const at = new Date().toISOString();
    const rec = { ...d, estado, lines: d.lines.map(lineaParaGuardar), total: r.neto, totalHe: r.he, count: d.lines.length, updatedAt: at, updatedBy: userName, ...(estado === "publicada" && d.estado !== "publicada" ? { publicadaAt: at, publicadaPor: userName } : {}) };
    delete rec.tardesPend;
    setPayBusy(true);
    try {
      let cloud; try { cloud = await store.getCloud("hr-pays"); } catch { cloud = null; }
      if (!Array.isArray(cloud)) { alert("No se pudo leer la nube. Revisá la conexión y volvé a intentar; la planilla NO se guardó."); return false; }
      const ok = await store.set("hr-pays", [...cloud.filter(p => p.id !== rec.id), rec]);
      if (!ok) { alert("No se pudo guardar en la nube. Volvé a intentar."); return false; }
      let ver; try { ver = await store.getCloud("hr-pays"); } catch { ver = null; }
      if (!Array.isArray(ver) || !ver.some(p => p.id === rec.id && p.updatedAt === at)) { alert("La nube no confirmó el guardado. Volvé a intentar antes de cerrar."); return false; }
      setPays(ver);
      setPayDraft(rec);
      await recordarEnFichas(rec.lines);
      return true;
    } finally { setPayBusy(false); }
  };
  // Lo que Carolina ajusta en la planilla y se repite cada mes queda en la
  // ficha: ISR del contador, método de pago y si el honorario es mensual.
  const recordarEnFichas = async (lines) => {
    const cambios = [];
    lines.forEach(l => {
      const e = emps.find(x => x.id === l.eid); if (!e) return;
      const c = {};
      if (l.aplicaLey && l.ct !== "honorarios" && Number(l.isr || 0) !== Number(e.isrMensual || 0)) c.isrMensual = Number(l.isr || 0);
      if ((l.metodoPago || "transferencia") !== (e.metodoPago || "transferencia")) c.metodoPago = l.metodoPago || "transferencia";
      if (l.ct === "honorarios" && (l.honorariosPago || "quincenal") !== (e.honorariosPago || "quincenal")) c.honorariosPago = l.honorariosPago || "quincenal";
      if (Object.keys(c).length) cambios.push([e.id, c]);
    });
    if (!cambios.length) return;
    try {
      const cloud = await store.getCloud("hr-emps5");
      if (!Array.isArray(cloud)) return;
      const map = Object.fromEntries(cambios);
      const next = cloud.map(e => map[e.id] ? { ...e, ...map[e.id] } : e);
      const ok = await store.set("hr-emps5", next);
      if (ok) setEmps(next);
    } catch { /* best effort: la planilla ya quedó guardada */ }
  };
  const borrarPlanilla = async (p) => {
    if (!confirm(`¿Eliminar la planilla ${etiquetaCorta(p.periodo, p.quincena)} de ${cc.name}?\n\nEsto no se puede deshacer.`)) return;
    let cloud; try { cloud = await store.getCloud("hr-pays"); } catch { cloud = null; }
    if (!Array.isArray(cloud)) return alert("No se pudo leer la nube. Volvé a intentar.");
    const ok = await store.set("hr-pays", cloud.filter(x => x.id !== p.id));
    if (!ok) return alert("No se pudo borrar en la nube.");
    setPays(cloud.filter(x => x.id !== p.id));
    if (payDraft?.id === p.id) { setPayDraft(null); setPayVista("lista"); }
  };
  const descargarPlanilla = async (tipo) => {
    const d = payDraft; if (!d) return;
    setPayBusy(true);
    try {
      const args = { empresa: cc.name, periodo: d.periodo, quincena: d.quincena, lines: d.lines, meta: { estado: d.estado, generadaPor: d.updatedBy || d.createdBy || userName, elaboradoPor: userName, heDe: d.heDe }, parte: payParte };
      if (tipo === "pdf") await exportarPlanillaPDF(args); else await exportarPlanillaExcel(args);
    } catch (e) { alert(`No se pudo generar el ${tipo === "pdf" ? "PDF" : "Excel"}: ${e?.message || e}`); }
    finally { setPayBusy(false); }
  };

  const PAY_IN = { padding: "8px 10px", border: "1px solid rgba(44,42,40,.12)", borderRadius: 10, font: "700 13px/1.2 var(--sans)", color: CHARCOAL, background: "rgba(255,255,255,.85)", outline: "none", width: 118, textAlign: "right", boxSizing: "border-box" };
  const chipPay = (txt, color = "#5C5853", bg = "rgba(44,42,40,.06)") => <span key={txt} style={{ padding: "4px 9px", borderRadius: 999, background: bg, color, font: "700 11px/1 var(--sans)", whiteSpace: "nowrap" }}>{txt}</span>;
  const estadoChip = (p) => p.estado === "publicada" ? chipPay("Publicada", "#3E8E5A", "rgba(62,142,90,.10)") : chipPay("Borrador", ORANGE_DARK, "rgba(232,118,45,.12)");

  const renderPayroll = () => payVista === "editor" && payDraft ? renderPlanillaEditor() : renderPlanillaLista();

  const renderPlanillaLista = () => {
    const sug = quincenaSugerida();
    const porAnio = {};
    planillasEmpresa.forEach(p => { const y = String(p.periodo).slice(0, 4); (porAnio[y] = porAnio[y] || []).push(p); });
    const asistSug = ca.some(a => a.periodo === sug.periodo && a.quincena === sug.quincena);
    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {puedePlanilla && <div className="gt-vidrio gt-sube" style={{ padding: isMobile ? 16 : "18px 22px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(232,118,45,.12)", color: "var(--naranja-tinta)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ font: "800 16px/1.2 var(--display)", color: CHARCOAL }}>Siguiente: {nombreQuincena(sug.periodo, sug.quincena)}</div>
          <div style={{ font: "500 12.5px/1.4 var(--sans)", color: "#6E6862", marginTop: 3 }}>{asistSug ? "La asistencia ya está registrada." : "Todavía no hay asistencia registrada: se pagaría completa, sin NSP ni feriados."} Horas extras de {etiquetaCorta(quincenaAnteriorPl(sug.periodo, sug.quincena).periodo, quincenaAnteriorPl(sug.periodo, sug.quincena).quincena)}.</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input type="month" value={payPer || sug.periodo} onChange={e => setPayPer(e.target.value)} style={{ ...PAY_IN, width: 150, textAlign: "left", fontWeight: 600 }} aria-label="Otro mes" />
          {pista([["1Q", "1Q"], ["2Q", "2Q"]].map(([k, l]) => ({ k, label: l, on: (payQui || sug.quincena) === k, onClick: () => setPayQui(k) })))}
          <button className="gt-btn gt-btn-primario" disabled={payBusy} onClick={() => nuevaPlanilla(payPer || sug.periodo, payQui || sug.quincena)} style={{ minHeight: 40, padding: "10px 18px", fontSize: 13.5 }}>{payBusy ? "Generando…" : (payPer || payQui) && ((payPer || sug.periodo) !== sug.periodo || (payQui || sug.quincena) !== sug.quincena) ? `Generar ${etiquetaCorta(payPer || sug.periodo, payQui || sug.quincena)}` : "Generar planilla"}</button>
        </div>
      </div>}
      {planillasEmpresa.length === 0 && <div className="gt-vidrio" style={{ padding: 34, textAlign: "center", color: "#6E6862", fontSize: 13.5 }}>Todavía no hay planillas generadas para {cc.name}.</div>}
      {Object.keys(porAnio).sort((a, b) => b.localeCompare(a)).map(y => <div key={y}>
        <div style={{ font: "800 15px/1 var(--display)", color: CHARCOAL, margin: "6px 2px 10px" }}>{y}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {porAnio[y].map((p, i) => <div key={p.id} role="button" tabIndex={0} className="gt-vidrio gt-vidrio-hover gt-sube" onClick={() => abrirPlanilla(p)} onKeyDown={(ev) => { if (ev.key === "Enter") abrirPlanilla(p); }}
            style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr) auto" : "minmax(0,1.4fr) 120px 110px 160px minmax(0,1fr) auto", alignItems: "center", gap: 14, padding: isMobile ? "12px 14px" : "14px 20px", cursor: "pointer", borderRadius: 18, animationDelay: `${i * 25}ms` }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ font: "700 14.5px/1.2 var(--sans)", color: CHARCOAL }}>{nombreQuincena(p.periodo, p.quincena)}</div>
              <div style={{ font: "500 12px/1.3 var(--sans)", color: "#6E6862", marginTop: 3 }}>{rangoQuincena(p.periodo, p.quincena)}{isMobile ? ` · ${p.count || (p.lines || []).length} personas` : ""}</div>
            </div>
            {!isMobile && <div>{estadoChip(p)}</div>}
            {!isMobile && <div style={{ font: "600 12.5px/1.2 var(--sans)", color: "#5C5853" }}>{p.count || (p.lines || []).length} personas</div>}
            {!isMobile && <div><div style={{ font: "800 15px/1 var(--display)", color: CHARCOAL }}>{fmtL(p.total)}</div>{Number(p.totalHe) > 0 && <div style={{ font: "600 11.5px/1 var(--sans)", color: "#6E6862", marginTop: 5 }}>+ HE {fmtL(p.totalHe)}</div>}</div>}
            {!isMobile && <div style={{ font: "500 12px/1.3 var(--sans)", color: "#A39C92", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.estado === "publicada" && p.publicadaAt ? `Publicada el ${fmt(p.publicadaAt)}${p.publicadaPor ? ` · ${p.publicadaPor}` : ""}` : `Generada el ${fmt(p.updatedAt || p.date)}${p.updatedBy || p.createdBy ? ` · ${p.updatedBy || p.createdBy}` : ""}`}</div>}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {isMobile && <span style={{ font: "800 14px/1 var(--display)", color: CHARCOAL }}>{fmtL(p.total)}</span>}
              {userRole === "admin" && <span role="button" aria-label="Eliminar planilla" onClick={(ev) => { ev.stopPropagation(); borrarPlanilla(p); }} style={{ color: "#A39C92", font: "600 12px/1 var(--sans)", cursor: "pointer", padding: 6 }}>Eliminar</span>}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A39C92" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="m9 6 6 6-6 6" /></svg>
            </div>
          </div>)}
        </div>
      </div>)}
    </div>;
  };

  // Planilla de HORAS EXTRAS (aparte de la de salarios): las de la quincena
  // ANTERIOR, por colaborador y banda, con su método de pago.
  const renderHeParte = (d, res, editable) => {
    const rows = lineasConHe(d.lines).filter(l => !payQ.trim() || `${l.name} ${l.pos}`.toLowerCase().includes(payQ.trim().toLowerCase()));
    const tileHe = (lab, val, destacar) => <div className="gt-vidrio" style={{ padding: "12px 16px", minWidth: 0, background: destacar ? "linear-gradient(165deg, rgba(232,118,45,.95), rgba(199,95,31,.95))" : undefined, color: destacar ? "#fff" : CHARCOAL }}>
      <div className="gt-label" style={{ color: destacar ? "rgba(255,255,255,.8)" : "#6E6862", fontSize: 9 }}>{lab}</div>
      <div style={{ font: `800 ${isMobile ? 17 : 20}px/1 var(--display)`, marginTop: 9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{val}</div>
    </div>;
    if (!d.heDe || !res.he) return <div className="gt-vidrio" style={{ padding: 34, textAlign: "center", color: "#6E6862", fontSize: 13.5, lineHeight: 1.6 }}>
      {d.heFaltante ? `No hay hoja de horas extras de ${etiquetaCorta(d.heFaltante.periodo, d.heFaltante.quincena)}.` : "Nadie tiene horas extras para pagar en esta quincena."}
      {tieneSec("horasextras") && <div><span role="button" onClick={() => irA("horasextras")} style={{ color: ORANGE_DARK, fontWeight: 700, cursor: "pointer" }}>Ir a Horas Extras →</span></div>}
    </div>;
    return <>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0,1fr))" : "repeat(4, minmax(0,1fr))", gap: 10 }}>
        {tileHe("Colaboradores", res.hePersonas)}
        {tileHe("Horas", res.heHrs)}
        {tileHe("Trabajadas en", etiquetaCorta(d.heDe.periodo, d.heDe.quincena))}
        {tileHe("Total horas extras", fmtL(res.he), true)}
      </div>
      <div className="gt-vidrio" style={{ padding: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A39C92" strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input type="search" value={payQ} onChange={e => setPayQ(e.target.value)} placeholder="Buscar colaborador" style={{ ...PAY_IN, width: "100%", textAlign: "left", fontWeight: 500, paddingLeft: 38 }} />
        </div>
        <span style={{ font: "500 12.5px/1.3 var(--sans)", color: "#6E6862" }}>Hora base = salario ÷ 30 ÷ 8 · domingo ×2</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((l, i) => {
          const e = emps.find(x => x.id === l.eid);
          const foto = e?.photo?.fileId ? photoCache[e.photo.fileId] : null;
          const b = l.he.bandas || {};
          const bandas = [["4–7 pm", b.b1?.hrs, "×1.25"], ["7–10 pm", b.b2?.hrs, "×1.5"], ["10–12", b.b3?.hrs, "×1.75"], ["Domingo", b.dom?.hrs, "×2"]].filter(([, h]) => h > 0);
          return <div key={l.id} className="gt-vidrio gt-sube" style={{ borderRadius: 18, padding: isMobile ? "10px 12px" : "11px 18px", display: "grid", gridTemplateColumns: isMobile ? "36px minmax(0,1fr) auto" : "36px minmax(0,1.3fr) minmax(0,1.6fr) 90px 80px 130px auto", alignItems: "center", gap: isMobile ? 10 : 14, animationDelay: `${Math.min(i, 14) * 20}ms` }}>
            <EmpAvatar name={l.name} dataUrl={foto} size={36} borderRadius={11} suave />
            <div style={{ minWidth: 0 }}>
              <div style={{ font: "700 14px/1.25 var(--sans)", color: CHARCOAL }}>{l.name}</div>
              <div style={{ font: "500 12px/1.3 var(--sans)", color: "#6E6862", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.pos || "Sin cargo"}</div>
            </div>
            {!isMobile && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{bandas.map(([a, h, m]) => <span key={a} style={{ padding: "4px 9px", borderRadius: 999, background: "rgba(44,42,40,.06)", color: "#5C5853", font: "600 11.5px/1 var(--sans)", whiteSpace: "nowrap" }}><b style={{ color: CHARCOAL }}>{h} h</b> {a} {m}</span>)}</div>}
            {!isMobile && <div style={{ textAlign: "right" }}><div style={{ font: "700 13px/1 var(--sans)", color: CHARCOAL }}>{fmtL(l.he.horaBase)}</div><div className="gt-label" style={{ color: "#A39C92", fontSize: 8.5, marginTop: 4 }}>hora base</div></div>}
            {!isMobile && <div style={{ textAlign: "right" }}><div style={{ font: "700 13.5px/1 var(--sans)", color: CHARCOAL }}>{l.he.hrs}</div><div className="gt-label" style={{ color: "#A39C92", fontSize: 8.5, marginTop: 4 }}>horas</div></div>}
            <div style={{ textAlign: "right" }}><div style={{ font: `800 ${isMobile ? 14 : 15.5}px/1 var(--display)`, color: CHARCOAL }}>{fmtL(l.he.monto)}</div><div className="gt-label" style={{ color: "#A39C92", fontSize: 8.5, marginTop: 4 }}>{isMobile ? `${l.he.hrs} h` : "a pagar"}</div></div>
            {!isMobile && (editable ? pista(METODOS_PAGO.map(([k, lab]) => ({ k, label: lab === "Transferencia" ? "Transf." : lab, on: (l.metodoPago || "transferencia") === k, onClick: () => upLinea(l.id, x => ({ ...x, metodoPago: k })) }))) : <span style={{ font: "600 12.5px/1 var(--sans)", color: "#5C5853" }}>{Object.fromEntries(METODOS_PAGO)[l.metodoPago || "transferencia"]}</span>)}
          </div>;
        })}
        {rows.length === 0 && <div className="gt-vidrio" style={{ padding: 30, textAlign: "center", color: "#6E6862", fontSize: 13.5 }}>Nadie coincide con la búsqueda.</div>}
      </div>
      <div className="gt-vidrio" style={{ padding: isMobile ? 14 : "16px 22px", display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "repeat(2, minmax(0,1fr))", gap: 14 }}>
        <div>
          <div className="gt-label" style={{ color: "#A39C92", fontSize: 9, marginBottom: 8 }}>Por método de pago</div>
          {METODOS_PAGO.filter(([k]) => res.hePorMetodo[k]?.n).map(([k, lab]) => <div key={k} style={{ display: "flex", justifyContent: "space-between", font: "500 13px/1.8 var(--sans)", color: "#5C5853" }}><span>{lab} · {res.hePorMetodo[k].n}</span><b style={{ color: CHARCOAL }}>{fmtL(res.hePorMetodo[k].monto)}</b></div>)}
        </div>
        <div>
          <div className="gt-label" style={{ color: "#A39C92", fontSize: 9, marginBottom: 8 }}>Total</div>
          <div style={{ display: "flex", justifyContent: "space-between", font: "500 13px/1.8 var(--sans)", color: "#5C5853" }}><span>Horas</span><b style={{ color: CHARCOAL }}>{res.heHrs}</b></div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 4, paddingTop: 6, borderTop: "1px solid rgba(44,42,40,.08)" }}><span style={{ font: "700 13px/1.4 var(--sans)", color: CHARCOAL }}>Total horas extras</span><b style={{ font: "800 20px/1 var(--display)", color: ORANGE_DARK }}>{fmtL(res.he)}</b></div>
        </div>
      </div>
    </>;
  };

  const renderPlanillaEditor = () => {
    const d = payDraft;
    const res = resumenPlanilla(d.lines);
    const ley = d.quincena === "2Q";
    const editable = puedePlanilla;
    const q = payQ.trim().toLowerCase();
    const visibles = d.lines.filter(l => (payGrupo === "todos" || l.ct === payGrupo) && (!q || `${l.name} ${l.pos} ${l.dni}`.toLowerCase().includes(q)));
    const todosAbiertos = visibles.length > 0 && visibles.every(l => payAbiertos[l.id]);
    const toggle = (id) => setPayAbiertos(p => { const n = { ...p }; if (n[id]) delete n[id]; else n[id] = true; return n; });
    const tile = (lab, val, destacar) => <div className="gt-vidrio" style={{ padding: "12px 16px", minWidth: 0, background: destacar ? "linear-gradient(165deg, rgba(232,118,45,.95), rgba(199,95,31,.95))" : undefined, color: destacar ? "#fff" : CHARCOAL }}>
      <div className="gt-label" style={{ color: destacar ? "rgba(255,255,255,.8)" : "#6E6862", fontSize: 9 }}>{lab}</div>
      <div style={{ font: `800 ${isMobile ? 17 : 20}px/1 var(--display)`, marginTop: 9, letterSpacing: "-.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{val}</div>
    </div>;
    const aviso = (txt, tono = "gris", onClick) => <span role={onClick ? "button" : undefined} onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 12px", borderRadius: 999, background: tono === "naranja" ? "rgba(232,118,45,.12)" : tono === "verde" ? "rgba(62,142,90,.10)" : "rgba(44,42,40,.06)", color: tono === "naranja" ? ORANGE_DARK : tono === "verde" ? "#3E8E5A" : "#5C5853", font: "600 12px/1.2 var(--sans)", cursor: onClick ? "pointer" : "default" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "currentColor", flexShrink: 0 }} />{txt}{onClick ? " →" : ""}
    </span>;
    const dato = (l, v, { color, bold = true } = {}) => <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid rgba(44,42,40,.06)" }}>
      <span style={{ font: "500 12.5px/1.3 var(--sans)", color: "#6E6862", minWidth: 0 }}>{l}</span>
      <span style={{ font: `${bold ? 700 : 500} 13px/1.3 var(--sans)`, color: color || CHARCOAL, whiteSpace: "nowrap" }}>{v}</span>
    </div>;
    const datoInput = (l, value, onChange, { sub } = {}) => <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "5px 0", borderBottom: "1px solid rgba(44,42,40,.06)" }}>
      <span style={{ font: "500 12.5px/1.3 var(--sans)", color: "#6E6862", minWidth: 0 }}>{l}{sub && <span style={{ display: "block", font: "400 11px/1.3 var(--sans)", color: "#A39C92" }}>{sub}</span>}</span>
      {editable ? <input type="number" step="0.01" value={value} onChange={e => onChange(e.target.value === "" ? 0 : Number(e.target.value))} style={PAY_IN} /> : <span style={{ font: "700 13px/1.3 var(--sans)", color: CHARCOAL }}>{fmtL(value)}</span>}
    </div>;
    const extrasDe = (l, tipo) => (l.extras || []).filter(x => x.tipo === tipo);
    const nuevoExtra = (l, tipo) => {
      const n = payNuevo && payNuevo.id === l.id && payNuevo.tipo === tipo ? payNuevo : null;
      if (!editable) return null;
      if (!n) return <span role="button" onClick={() => setPayNuevo({ id: l.id, tipo, concepto: "", monto: "" })} style={{ display: "inline-block", marginTop: 8, font: "700 12px/1 var(--sans)", color: ORANGE_DARK, cursor: "pointer" }}>+ Agregar {tipo === "ingreso" ? "ingreso" : "deducción"}</span>;
      const ok = () => { const m = Number(n.monto); if (!n.concepto.trim() || !(m > 0)) return alert("Poné el concepto y un monto mayor que 0."); upLinea(l.id, x => ({ ...x, extras: [...(x.extras || []), { id: uid(), tipo, concepto: n.concepto.trim(), monto: Math.round(m * 100) / 100 }] })); setPayNuevo(null); };
      return <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input autoFocus placeholder={tipo === "ingreso" ? "Concepto · ej. Bono foráneo" : "Concepto · ej. Préstamo"} value={n.concepto} onChange={e => setPayNuevo({ ...n, concepto: e.target.value })} onKeyDown={e => { if (e.key === "Enter") ok(); if (e.key === "Escape") setPayNuevo(null); }} style={{ ...PAY_IN, textAlign: "left", fontWeight: 500, flex: "1 1 160px", width: "auto" }} />
        <input type="number" step="0.01" placeholder="Monto" value={n.monto} onChange={e => setPayNuevo({ ...n, monto: e.target.value })} onKeyDown={e => { if (e.key === "Enter") ok(); if (e.key === "Escape") setPayNuevo(null); }} style={{ ...PAY_IN, width: 110 }} />
        <button onClick={ok} style={{ minHeight: 36, padding: "8px 14px", borderRadius: 999, border: "none", background: ORANGE, color: "#fff", font: "700 12px/1 var(--sans)", cursor: "pointer" }}>Agregar</button>
        <button onClick={() => setPayNuevo(null)} style={{ minHeight: 36, padding: "8px 10px", borderRadius: 999, border: "none", background: "transparent", color: "#6E6862", font: "600 12px/1 var(--sans)", cursor: "pointer" }}>Cancelar</button>
      </div>;
    };
    const quitarExtra = (l, id) => upLinea(l.id, x => ({ ...x, extras: (x.extras || []).filter(e => e.id !== id) }));

    const fila = (l, i) => {
      const t = totalesLinea(l);
      const abierto = !!payAbiertos[l.id];
      const e = emps.find(x => x.id === l.eid);
      const foto = e?.photo?.fileId ? photoCache[e.photo.fileId] : null;
      const chips = [];
      if (l.sinAsistencia) chips.push(chipPay("Sin asistencia", ORANGE_DARK, "rgba(232,118,45,.12)"));
      if (l.diasNSP) chips.push(chipPay(`${l.diasNSP} NSP`, "#B03024", "rgba(192,57,43,.09)"));
      if (l.tardes) chips.push(chipPay(`${l.tardes} tarde`, ORANGE_DARK, "rgba(232,118,45,.12)"));
      if (l.ferTrab) chips.push(chipPay(`${l.ferTrab} feriado${l.ferTrab > 1 ? "s" : ""}`));
      if (l.domTrab + (l.domTrabTriple || 0)) chips.push(chipPay(`${l.domTrab + (l.domTrabTriple || 0)} domingo${l.domTrab + (l.domTrabTriple || 0) > 1 ? "s" : ""}`));
      if (l.diasFueraRango) chips.push(chipPay(`${l.diasEfectivos} de ${l.totalDays} días`));
      if (l.ct === "honorarios" && l.honorariosPago === "mensual") chips.push(chipPay("Mensual"));
      if ((l.extras || []).length) chips.push(chipPay(`${(l.extras || []).length} extra${(l.extras || []).length > 1 ? "s" : ""}`, ORANGE_DARK, "rgba(232,118,45,.12)"));
      const dias = diasMostrados(l);
      return <div key={l.id} className="gt-vidrio gt-sube" style={{ borderRadius: 18, overflow: "hidden", animationDelay: `${Math.min(i, 14) * 20}ms` }}>
        <div role="button" tabIndex={0} aria-expanded={abierto} onClick={() => toggle(l.id)} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggle(l.id); } }}
          style={{ display: "grid", gridTemplateColumns: isMobile ? "36px minmax(0,1fr) auto" : "36px minmax(0,1.7fr) 70px 120px 120px 120px 130px 24px", alignItems: "center", gap: isMobile ? 10 : 14, padding: isMobile ? "10px 12px" : "11px 18px", cursor: "pointer" }}>
          <EmpAvatar name={l.name} dataUrl={foto} size={36} borderRadius={11} suave />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ font: "700 14px/1.25 var(--sans)", color: CHARCOAL }}>{l.name}</span>
              {!isMobile && chips}
            </div>
            <div style={{ font: "500 12px/1.3 var(--sans)", color: "#6E6862", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.pos || "Sin cargo"}{l.proj ? ` · ${l.proj}` : ""}</div>
          </div>
          {!isMobile && <div style={{ textAlign: "right" }}><div style={{ font: "700 13.5px/1 var(--sans)", color: CHARCOAL }}>{dias}</div><div className="gt-label" style={{ color: "#A39C92", fontSize: 8.5, marginTop: 4 }}>días</div></div>}
          {!isMobile && <div style={{ textAlign: "right" }}><div style={{ font: "700 13.5px/1 var(--sans)", color: CHARCOAL }}>{fmtL(t.ordinario)}</div><div className="gt-label" style={{ color: "#A39C92", fontSize: 8.5, marginTop: 4 }}>ordinario</div></div>}
          {!isMobile && <div style={{ textAlign: "right" }}><div style={{ font: "700 13.5px/1 var(--sans)", color: t.ingresos ? "#3E8E5A" : "#A39C92" }}>{t.ingresos ? `+${fmtL(t.ingresos)}` : "—"}</div><div className="gt-label" style={{ color: "#A39C92", fontSize: 8.5, marginTop: 4 }}>ingresos</div></div>}
          {!isMobile && <div style={{ textAlign: "right" }}><div style={{ font: "700 13.5px/1 var(--sans)", color: t.deducciones ? "#B03024" : "#A39C92" }}>{t.deducciones ? `−${fmtL(t.deducciones)}` : "—"}</div><div className="gt-label" style={{ color: "#A39C92", fontSize: 8.5, marginTop: 4 }}>deducciones</div></div>}
          <div style={{ textAlign: "right" }}><div style={{ font: `800 ${isMobile ? 14 : 15.5}px/1 var(--display)`, color: CHARCOAL }}>{fmtL(t.neto)}</div><div className="gt-label" style={{ color: "#A39C92", fontSize: 8.5, marginTop: 4 }}>neto</div></div>
          {!isMobile && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A39C92" strokeWidth="2.2" strokeLinecap="round" style={{ transform: abierto ? "rotate(180deg)" : "none", transition: "transform 300ms var(--curva)" }} aria-hidden><path d="m6 9 6 6 6-6" /></svg>}
        </div>
        {abierto && <div className="gt-aparece" style={{ borderTop: "1px solid rgba(44,42,40,.07)", padding: isMobile ? "12px 14px 16px" : "14px 18px 18px 68px" }}>
          {isMobile && chips.length > 0 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>{chips}</div>}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(0,1fr) minmax(0,1fr) minmax(0,.9fr)", gap: isMobile ? 16 : 24 }}>
            <div>
              <div className="gt-label" style={{ color: "#3E8E5A", fontSize: 9, marginBottom: 4 }}>Ingresos</div>
              {dato(l.ct === "honorarios" ? "Honorarios" : "Salario ordinario", fmtL(t.ordinario))}
              {datoInput("Bonificación", l.bq, v => upLinea(l.id, x => ({ ...x, bq: v })), { sub: `${fmtL(l.bn)} al mes` })}
              {l.bonoFeriado > 0 && dato(`Feriados trabajados ×${l.ferTrab} (dos diarios c/u)`, fmtL(l.bonoFeriado))}
              {l.bonoDomingo > 0 && dato(`Domingos trabajados ×${l.domTrab}${l.domTrabTriple ? ` + ${l.domTrabTriple} triple` : ""}`, fmtL(l.bonoDomingo))}
              {extrasDe(l, "ingreso").map(x => <div key={x.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid rgba(44,42,40,.06)" }}>
                <span style={{ font: "500 12.5px/1.3 var(--sans)", color: ORANGE_DARK, minWidth: 0 }}>{x.concepto}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><b style={{ font: "700 13px/1.3 var(--sans)", color: CHARCOAL }}>{fmtL(x.monto)}</b>{editable && <span role="button" aria-label="Quitar" onClick={() => quitarExtra(l, x.id)} style={{ color: "#A39C92", cursor: "pointer", fontSize: 14 }}>✕</span>}</span>
              </div>)}
              {nuevoExtra(l, "ingreso")}
            </div>
            <div>
              <div className="gt-label" style={{ color: "#B03024", fontSize: 9, marginBottom: 4 }}>Deducciones</div>
              {l.descuentoNSP > 0 && dato(`Inasistencias · ${l.diasNSP} NSP`, `−${fmtL(l.descuentoNSP)}`, { color: "#B03024" })}
              {l.descuentoHoras > 0 && dato(`Llegadas tarde denegadas · ${l.horasTarde} h`, `−${fmtL(l.descuentoHoras)}`, { color: "#B03024" })}
              {l.descuentoIncap > 0 && dato(`Incapacidad · ${l.diasIncapIhss} ${l.diasIncapIhss === 1 ? "día" : "días"} al 34 % (paga el IHSS)`, `−${fmtL(l.descuentoIncap)}`, { color: "#B03024" })}
              {l.ct === "honorarios"
                ? datoInput("ISR 12.5 %", l.isr, v => upLinea(l.id, x => ({ ...x, isr: v })), { sub: l.honorariosPago === "mensual" ? "mensual: no se retiene" : "sobre lo que cobra" })
                : ley
                  ? <>
                    {datoInput("ISR", l.isr, v => upLinea(l.id, x => ({ ...x, isr: v })), { sub: "lo manda el contador · se recuerda" })}
                    {dato("IHSS", l.ihss ? `−${fmtL(l.ihss)}` : "—", { color: l.ihss ? "#B03024" : "#A39C92" })}
                    {dato("RAP", l.rap ? `−${fmtL(l.rap)}` : "—", { color: l.rap ? "#B03024" : "#A39C92" })}
                  </>
                  : dato("ISR · IHSS · RAP", "en la 2Q", { color: "#A39C92", bold: false })}
              {datoInput("Cooperativa", l.coop, v => upLinea(l.id, x => ({ ...x, coop: v })))}
              {extrasDe(l, "deduccion").map(x => <div key={x.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid rgba(44,42,40,.06)" }}>
                <span style={{ font: "500 12.5px/1.3 var(--sans)", color: ORANGE_DARK, minWidth: 0 }}>{x.concepto}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><b style={{ font: "700 13px/1.3 var(--sans)", color: "#B03024" }}>−{fmtL(x.monto)}</b>{editable && <span role="button" aria-label="Quitar" onClick={() => quitarExtra(l, x.id)} style={{ color: "#A39C92", cursor: "pointer", fontSize: 14 }}>✕</span>}</span>
              </div>)}
              {nuevoExtra(l, "deduccion")}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ borderRadius: 14, background: "rgba(44,42,40,.04)", padding: "12px 14px" }}>
                <div className="gt-label" style={{ color: "#A39C92", fontSize: 9 }}>Asistencia</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8, marginTop: 8 }}>
                  {[["Presentes", l.diasPresente], ["NSP", l.diasNSP, l.diasNSP ? "#B03024" : null], ["Incap.", l.diasIncap], ["Vacac.", l.diasVac], ["Feriados", l.ferTrab], ["Domingos", l.domTrab + (l.domTrabTriple || 0)]].map(([a, b, c]) => <div key={a}>
                    <div style={{ font: "800 16px/1 var(--display)", color: c || CHARCOAL }}>{b || 0}</div>
                    <div style={{ font: "500 11px/1 var(--sans)", color: "#6E6862", marginTop: 4 }}>{a}</div>
                  </div>)}
                </div>
                {l.sinAsistencia && <div style={{ font: "500 11.5px/1.4 var(--sans)", color: ORANGE_DARK, marginTop: 10 }}>No hay hoja de asistencia: se paga la quincena completa.</div>}
              </div>
              <div>
                <div className="gt-label" style={{ color: "#A39C92", fontSize: 9, marginBottom: 7 }}>Método de pago</div>
                {editable ? pista(METODOS_PAGO.map(([k, lab]) => ({ k, label: lab, on: (l.metodoPago || "transferencia") === k, onClick: () => upLinea(l.id, x => ({ ...x, metodoPago: k })) }))) : <span style={{ font: "600 13px/1 var(--sans)" }}>{Object.fromEntries(METODOS_PAGO)[l.metodoPago || "transferencia"]}</span>}
              </div>
              {l.ct === "honorarios" && editable && <div>
                <div className="gt-label" style={{ color: "#A39C92", fontSize: 9, marginBottom: 7 }}>Honorarios</div>
                {pista([["quincenal", "Quincenal"], ["mensual", "Mensual"]].map(([k, lab]) => ({ k, label: lab, on: (l.honorariosPago || "quincenal") === k, onClick: () => upLinea(l.id, x => { const mensual = k === "mensual"; const ord = mensual ? x.sb : Math.round(x.sb / 2 * 100) / 100; const bq = mensual ? x.bn : Math.round(x.bn / 2 * 100) / 100; return { ...x, honorariosPago: k, ordinario: ord, bq, isr: mensual ? 0 : Math.round((ord + bq) * 0.125 * 100) / 100 }; }) })))}
                <div style={{ font: "400 11px/1.4 var(--sans)", color: "#A39C92", marginTop: 6 }}>Mensual: cobra el mes completo en esta quincena y no sale en la otra.</div>
              </div>}
              <div>
                <div className="gt-label" style={{ color: "#A39C92", fontSize: 9, marginBottom: 7 }}>Nota</div>
                {editable ? <input value={l.nota || ""} onChange={e => upLinea(l.id, x => ({ ...x, nota: e.target.value }))} placeholder="Sale en la planilla" style={{ ...PAY_IN, width: "100%", textAlign: "left", fontWeight: 500 }} /> : <span style={{ font: "500 13px/1.4 var(--sans)", color: "#5C5853" }}>{l.nota || "—"}</span>}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingTop: 10, borderTop: "1px solid rgba(44,42,40,.08)" }}>
                <span style={{ font: "600 12.5px/1 var(--sans)", color: "#6E6862" }}>Neto a pagar</span>
                <span style={{ font: "800 20px/1 var(--display)", color: ORANGE_DARK }}>{fmtL(t.neto)}</span>
              </div>
            </div>
          </div>
        </div>}
      </div>;
    };

    const grupos = GRUPOS_CT.map(([k, lab]) => [k, lab, visibles.filter(l => l.ct === k)]).filter(([, , rows]) => rows.length);
    return <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 90 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button type="button" className="gt-circulo" onClick={() => { if (!payBusy) { setPayVista("lista"); } }} aria-label="Volver a planillas" style={{ width: 36, height: 36, fontSize: 15 }}>←</button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ font: "800 18px/1.2 var(--display)", color: CHARCOAL }}>{nombreQuincena(d.periodo, d.quincena)}</span>
            {estadoChip(d)}
          </div>
          <div style={{ font: "500 12.5px/1.4 var(--sans)", color: "#6E6862", marginTop: 2 }}>{cc.name} · {rangoQuincena(d.periodo, d.quincena)}{d.publicadaAt ? ` · publicada el ${fmt(d.publicadaAt)} por ${d.publicadaPor || ""}` : ""}</div>
        </div>
        {editable && <span role="button" onClick={() => { if (!payBusy) regenerarPlanilla(); }} style={{ font: "600 12.5px/1 var(--sans)", color: "#5C5853", cursor: "pointer", padding: "8px 12px", borderRadius: 999, border: "1px solid rgba(44,42,40,.14)" }}>↻ Releer asistencia</span>}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {d.sinAsistencia ? aviso("Sin asistencia registrada: se paga la quincena completa, sin NSP ni feriados", "naranja", tieneSec("attendance") ? () => irA("attendance") : undefined) : aviso("Asistencia leída de la hoja de la quincena", "verde")}
        {d.heDe ? aviso(`Horas extras de ${etiquetaCorta(d.heDe.periodo, d.heDe.quincena)}: ${res.heHrs ? `${res.heHrs} h · ${fmtL(res.he)}` : "sin horas"}`, res.he ? "verde" : "gris", res.he && payParte !== "he" ? () => setPayParte("he") : undefined) : d.heFaltante ? aviso(`No hay hoja de horas extras de ${etiquetaCorta(d.heFaltante.periodo, d.heFaltante.quincena)}`, "gris", nav.some(n => n.id === "horasextras") ? () => setSec("horasextras") : undefined) : null}
        {Array.isArray(d.tardesPend) && d.tardesPend.length > 0 && aviso(`${d.tardesPend.length} llegada${d.tardesPend.length > 1 ? "s" : ""} tarde sin decidir: se paga el día completo`, "naranja", tieneSec("tardanzas") ? () => irA("tardanzas") : undefined)}
        {aviso(ley ? "Segunda quincena: aplican IHSS, RAP e ISR" : "Primera quincena: las deducciones de ley van en la 2Q", "gris")}
      </div>

      {/* Dos planillas de la MISMA quincena, cada una con su PDF y su Excel. */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "repeat(2, minmax(0,1fr))", gap: 10 }}>
        {[["salarios", "Planilla de salarios", `${res.personas} colaboradores`, res.neto], ["he", "Planilla de horas extras", d.heDe ? `${res.hePersonas} colaboradores · ${res.heHrs} h de ${etiquetaCorta(d.heDe.periodo, d.heDe.quincena)}` : "sin hoja de horas extras", res.he]].map(([k, tit, sub, monto]) => {
          const on = payParte === k;
          return <div key={k} role="button" tabIndex={0} aria-pressed={on} onClick={() => setPayParte(k)} onKeyDown={(ev) => { if (ev.key === "Enter") setPayParte(k); }} className="gt-vidrio gt-vidrio-hover"
            style={{ padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, boxShadow: on ? `inset 0 0 0 2px ${ORANGE}, 0 12px 30px rgba(44,42,40,.10)` : undefined }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ font: "800 15px/1.2 var(--display)", color: on ? ORANGE_DARK : CHARCOAL }}>{tit}</div>
              <div style={{ font: "500 12px/1.3 var(--sans)", color: "#6E6862", marginTop: 3 }}>{sub}</div>
            </div>
            <div style={{ font: "800 19px/1 var(--display)", color: on ? ORANGE_DARK : CHARCOAL, whiteSpace: "nowrap" }}>{fmtL(monto)}</div>
          </div>;
        })}
      </div>

      {payParte === "he" ? renderHeParte(d, res, editable) : <>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0,1fr))" : "repeat(5, minmax(0,1fr))", gap: 10 }}>
        {tile("Colaboradores", res.personas)}
        {tile("Ordinario", fmtL(res.ordinario))}
        {tile("Ingresos", fmtL(res.ingresos))}
        {tile("Deducciones", fmtL(res.deducciones))}
        {tile("Total salarios", fmtL(res.neto), true)}
      </div>

      <div className="gt-vidrio" style={{ padding: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A39C92" strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input type="search" value={payQ} onChange={e => setPayQ(e.target.value)} placeholder="Buscar colaborador" style={{ ...PAY_IN, width: "100%", textAlign: "left", fontWeight: 500, paddingLeft: 38 }} />
        </div>
        {pista([["todos", `Todos ${d.lines.length}`], ...GRUPOS_CT.filter(([k]) => d.lines.some(l => l.ct === k)).map(([k, lab]) => [k, `${lab} ${d.lines.filter(l => l.ct === k).length}`])].map(([k, label]) => ({ k, label, on: payGrupo === k, onClick: () => setPayGrupo(k) })))}
        {visibles.length > 1 && <span role="button" onClick={() => setPayAbiertos(todosAbiertos ? {} : Object.fromEntries(visibles.map(l => [l.id, true])))} style={{ padding: "8px 12px", borderRadius: 999, font: "600 12.5px/1 var(--sans)", color: "#5C5853", cursor: "pointer" }}>{todosAbiertos ? "Compactar todo" : "Expandir todo"}</span>}
      </div>

      {grupos.map(([k, lab, rows]) => <div key={k}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "4px 2px 10px" }}>
          <span style={{ font: "800 15px/1 var(--display)", color: CHARCOAL }}>{lab}</span>
          <span style={{ font: "600 13px/1 var(--sans)", color: "#A39C92" }}>{rows.length}</span>
          <span style={{ marginLeft: "auto", font: "700 13px/1 var(--sans)", color: "#5C5853" }}>{fmtL(rows.reduce((s, l) => s + totalesLinea(l).neto, 0))}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{rows.map(fila)}</div>
      </div>)}
      {visibles.length === 0 && <div className="gt-vidrio" style={{ padding: 30, textAlign: "center", color: "#6E6862", fontSize: 13.5 }}>Nadie coincide con la búsqueda.</div>}

      <div className="gt-vidrio" style={{ padding: isMobile ? 14 : "16px 22px", display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "repeat(3, minmax(0,1fr))", gap: 14 }}>
        <div>
          <div className="gt-label" style={{ color: "#A39C92", fontSize: 9, marginBottom: 8 }}>Por tipo</div>
          {GRUPOS_CT.filter(([k]) => res.porGrupo[k]?.n).map(([k, lab]) => <div key={k} style={{ display: "flex", justifyContent: "space-between", font: "500 13px/1.8 var(--sans)", color: "#5C5853" }}><span>{lab} · {res.porGrupo[k].n}</span><b style={{ color: CHARCOAL }}>{fmtL(res.porGrupo[k].neto)}</b></div>)}
        </div>
        <div>
          <div className="gt-label" style={{ color: "#A39C92", fontSize: 9, marginBottom: 8 }}>Por método de pago</div>
          {METODOS_PAGO.filter(([k]) => res.porMetodo[k]?.n).map(([k, lab]) => <div key={k} style={{ display: "flex", justifyContent: "space-between", font: "500 13px/1.8 var(--sans)", color: "#5C5853" }}><span>{lab} · {res.porMetodo[k].n}</span><b style={{ color: CHARCOAL }}>{fmtL(res.porMetodo[k].neto)}</b></div>)}
        </div>
        <div>
          <div className="gt-label" style={{ color: "#A39C92", fontSize: 9, marginBottom: 8 }}>Total</div>
          <div style={{ display: "flex", justifyContent: "space-between", font: "500 13px/1.8 var(--sans)", color: "#5C5853" }}><span>Colaboradores</span><b style={{ color: CHARCOAL }}>{res.personas}</b></div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 4, paddingTop: 6, borderTop: "1px solid rgba(44,42,40,.08)" }}><span style={{ font: "700 13px/1.4 var(--sans)", color: CHARCOAL }}>Total salarios</span><b style={{ font: "800 20px/1 var(--display)", color: ORANGE_DARK }}>{fmtL(res.neto)}</b></div>
        </div>
      </div>
      </>}

      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 5, padding: isMobile ? "10px 12px" : "12px 32px", pointerEvents: "none" }}>
        <div className="gt-vidrio" style={{ maxWidth: 1436, margin: "0 auto", padding: isMobile ? "10px 12px" : "10px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", pointerEvents: "auto", borderRadius: 18 }}>
          <span style={{ font: "600 12.5px/1.3 var(--sans)", color: "#6E6862", marginRight: "auto" }}>{payBusy ? "Un momento…" : payParte === "he" ? `Horas extras · ${res.hePersonas} colaboradores · ${fmtL(res.he)}` : `Salarios · ${res.personas} colaboradores · ${fmtL(res.neto)}`}</span>
          <button disabled={payBusy} onClick={() => descargarPlanilla("excel")} style={{ minHeight: 38, padding: "9px 14px", borderRadius: 999, border: "1px solid rgba(44,42,40,.14)", background: "rgba(255,255,255,.8)", color: "#5C5853", font: "700 12.5px/1 var(--sans)", cursor: "pointer" }}>{payParte === "he" ? "Excel de horas extras" : "Excel"}</button>
          <button disabled={payBusy} onClick={() => descargarPlanilla("pdf")} style={{ minHeight: 38, padding: "9px 14px", borderRadius: 999, border: "1px solid rgba(44,42,40,.14)", background: "rgba(255,255,255,.8)", color: "#5C5853", font: "700 12.5px/1 var(--sans)", cursor: "pointer" }}>{payParte === "he" ? "PDF de horas extras" : "PDF"}</button>
          {editable && <button disabled={payBusy} onClick={async () => { if (await guardarPlanilla(d.estado === "publicada" ? "publicada" : "borrador")) alert(d.estado === "publicada" ? "Cambios guardados en la planilla publicada." : "Borrador guardado."); }} style={{ minHeight: 38, padding: "9px 16px", borderRadius: 999, border: "none", background: "#3E8E5A", color: "#fff", font: "700 12.5px/1 var(--sans)", cursor: "pointer" }}>{d.estado === "publicada" ? "Guardar cambios" : "Guardar borrador"}</button>}
          {editable && d.estado !== "publicada" && <button disabled={payBusy} onClick={async () => { if (!confirm(`¿Publicar las planillas ${etiquetaCorta(d.periodo, d.quincena)} de ${cc.name}?\n\nSalarios: ${fmtL(res.neto)}\nHoras extras: ${fmtL(res.he)}\n\nQuedan como las planillas oficiales de la quincena. Después igual podés corregirlas.`)) return; if (await guardarPlanilla("publicada")) alert("Planilla publicada. Ya podés descargar el PDF y el Excel."); }} className="gt-btn gt-btn-primario" style={{ minHeight: 38, padding: "9px 18px", fontSize: 13 }}>Publicar</button>}
        </div>
      </div>
    </div>;
  };

  const renderVacs = () => <div style={{ display: "flex", flexDirection: "column", gap: 16 }}><div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#64748b", fontSize: 13 }}>{cv.length} solicitudes</span><Btn onClick={() => setModal({ t: "vn" })}>+ Nueva</Btn></div><Table columns={[{ key: "e", label: "Empleado", render: r => en(r.employeeId) }, { key: "s", label: "Desde", render: r => fmt(r.startDate) }, { key: "f", label: "Hasta", render: r => fmt(r.endDate) }, { key: "days", label: "Dias" }, { key: "st", label: "Estado", render: r => <Badge color={r.status === "approved" ? "#059669" : r.status === "rejected" ? "#DC2626" : "#D97706"}>{r.status === "approved" ? "Aprobado" : r.status === "rejected" ? "Rechazado" : "Pendiente"}</Badge> }]} data={cv} actions={r => <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}><Btn small variant="ghost" onClick={() => setModal({ t: "ve", d: r })}>Editar</Btn><Btn small variant="danger" onClick={async () => { if (!confirm(`¿Eliminar las vacaciones de ${en(r.employeeId)} (${fmt(r.startDate)} → ${fmt(r.endDate)})?\n\nTambién se desmarcan los días "V" que puso en la asistencia.`)) return; await sV(vacs.filter(v => v.id !== r.id)); await syncVacacion(null, r); }}>×</Btn></div>} /></div>;

  const renderLvs = () => <div style={{ display: "flex", flexDirection: "column", gap: 16 }}><div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#64748b", fontSize: 13 }}>{cl.length} permisos</span><Btn onClick={() => setModal({ t: "ln" })}>+ Nuevo</Btn></div><Table columns={[{ key: "e", label: "Empleado", render: r => en(r.employeeId) }, { key: "d", label: "Fecha", render: r => fmt(r.date) }, { key: "t", label: "Tipo", render: r => <Badge>{r.type}</Badge> }, { key: "r", label: "Motivo", render: r => r.reason }, { key: "s", label: "Estado", render: r => <Badge color={r.status === "approved" ? "#059669" : "#D97706"}>{r.status === "approved" ? "Aprobado" : "Pendiente"}</Badge> }]} data={cl} actions={r => <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}><Btn small variant="ghost" onClick={() => setModal({ t: "le", d: r })}>Editar</Btn><Btn small variant="danger" onClick={async () => { if (!confirm(`¿Eliminar el permiso de ${en(r.employeeId)} del ${fmt(r.date)}?\n\nTambién se desmarca el día en la asistencia.`)) return; await sL(lvs.filter(l => l.id !== r.id)); await syncPermiso(null, r); }}>×</Btn></div>} /></div>;

  // ═══════════════════════════════════════════════════════════════════
  // HUB DE ASISTENCIA (23-oct-2026, Gerson: "asistencia, llegadas tardías y
  // horas extras juntos en un solo apartado, tipo Solicitudes; misma
  // estética, sin tantos colores ni texto; y que ahí viva GeoClock")
  // ═══════════════════════════════════════════════════════════════════
  const renderAsistenciaHub = () => {
    const hoy = hoyTegus();
    const marcasTardeCo = Object.values(gcMarks).flat().filter(mk => mk && mk.company === co && mk.tipo === "entrada" && mk.tarde);
    const nPend = marcasTardeCo.filter(mk => !(gcTardies || []).some(t => t && t.markId === mk.id && (t.estado === "aprobada" || t.estado === "denegada"))).length;
    const entradasHoy = Object.values(gcMarks).flat().filter(mk => mk && mk.company === co && mk.tipo === "entrada" && mk.fecha === hoy).length;
    const ult = ca.slice().sort((a, b) => `${b.periodo}-${b.quincena}`.localeCompare(`${a.periodo}-${a.quincena}`))[0];
    const ultHe = che.filter(h => Object.keys(h.hours || {}).length).sort((a, b) => `${b.periodo}-${b.quincena}`.localeCompare(`${a.periodo}-${a.quincena}`))[0];
    const tHe = ultHe ? heTotalsOf(ultHe) : null;
    const puedeClock = ["admin", "coordinador", "tesoreria", "asistente_compras", "logistica"].includes(userRole) && typeof onAbrirModulo === "function";
    const soloTard = isOscarTardies;
    if (asisSub) {
      const t = asisSub === "hojas" ? ["Asistencia", "hojas por quincena · " + cc.name] : asisSub === "tardanzas" ? ["Llegadas tardías", `${TOLERANCIA_MIN} min de tolerancia sobre el horario de cada quien · ${cc.name}`] : ["Horas extras", "se pagan quincena vencida · " + cc.name];
      return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {cabeceraSub(t[0], t[1], null, () => setAsisSub(""))}
        {asisSub === "hojas" ? renderAtts() : asisSub === "tardanzas" ? renderTardanzas() : renderHE()}
      </div>;
    }
    // Cajas grandes que llenan la pantalla (23-oct-2026): 2×2 que se estiran
    // al alto disponible; el número y el ícono crecen con ellas.
    const tarjeta = (ico, titulo, sub, n, onClick, tonoN = CHARCOAL, detalle) => <div className="gt-vidrio gt-vidrio-hover" role="button" tabIndex={0} onClick={onClick} onKeyDown={e => { if (e.key === "Enter") onClick(); }}
      style={{ padding: isMobile ? "20px" : "clamp(22px,4vh,40px) clamp(24px,3vw,44px)", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 18, cursor: "pointer", minHeight: isMobile ? 150 : 0, boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
        <div style={{ width: "clamp(52px,8vh,76px)", height: "clamp(52px,8vh,76px)", borderRadius: 22, background: "rgba(232,118,45,.12)", color: "var(--naranja-tinta)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><IcoH d={ico} size={36} /></div>
        {n != null && <div style={{ font: "800 clamp(44px,9vh,84px)/1 var(--display)", color: tonoN, letterSpacing: "-.04em" }}>{n}</div>}
        {n == null && <div style={{ width: 42, height: 42, borderRadius: "50%", background: "rgba(44,42,40,.05)", display: "flex", alignItems: "center", justifyContent: "center" }}><IcoH d={ICO_HUB.flecha} size={20} color="#6E6862" /></div>}
      </div>
      <div>
        <div style={{ font: "800 clamp(22px,3.6vh,32px)/1.15 var(--display)", color: CHARCOAL, letterSpacing: "-.02em" }}>{titulo}</div>
        <div style={{ fontSize: "clamp(13px,1.9vh,15.5px)", color: "#6E6862", marginTop: 8, lineHeight: 1.45, maxWidth: 520 }}>{sub}</div>
        {detalle && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>{detalle}</div>}
      </div>
    </div>;
    return <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gridAutoRows: isMobile ? "auto" : "1fr", gap: 16, minHeight: isMobile ? undefined : "calc(100vh - 200px)" }}>
      {!soloTard && tarjeta(ICO_HUB.hojas, "Asistencia", ult ? `${ca.length} quincena${ca.length === 1 ? "" : "s"} con hoja · la última es ${etiquetaCorta(ult.periodo, ult.quincena)}` : "Cuadrillas y hojas por quincena", cq.length, () => setAsisSub("hojas"), CHARCOAL,
        <>{chipH(`${cq.length} cuadrillas`, "gris")}{ult && chipH(etiquetaCorta(ult.periodo, ult.quincena), "verde")}</>)}
      {tarjeta(ICO_HUB.tarde, "Llegadas tardías", nPend ? "Por decidir: aprobás el día completo o denegás con descuento" : "Nada por decidir", nPend, () => setAsisSub("tardanzas"), nPend ? "#A94E16" : CHARCOAL,
        <>{chipH(nPend ? `${nPend} por decidir` : "Al día", nPend ? "naranja" : "verde")}{chipH(`${TOLERANCIA_MIN} min de tolerancia`, "gris")}</>)}
      {!soloTard && tarjeta(ICO_HUB.horas, "Horas extras", ultHe ? `Última hoja: ${etiquetaCorta(ultHe.periodo, ultHe.quincena)} · se paga quincena vencida` : "Hojas por quincena, se pagan quincena vencida", che.length, () => setAsisSub("he"), CHARCOAL,
        ultHe ? <>{chipH(`${fmtDias(tHe.hrs)} h`, "gris")}{!hideSalary && chipH(fmtL(tHe.costo), "verde")}</> : null)}
      {puedeClock && tarjeta(ICO_HUB.tablet, "GeoClock", "El reloj de las tablets: marcaje, foto y firma, y el registro de entradas y salidas", null, () => onAbrirModulo("geoclock"), CHARCOAL,
        <>{chipH(`${entradasHoy} entrada${entradasHoy === 1 ? "" : "s"} hoy`, entradasHoy ? "verde" : "gris")}</>)}
    </div>;
  };

  const renderAtts = () => {
    const openGrid = async (cuad) => {
      // Refresca los marcajes GeoClock de esta quincena Y las decisiones de
      // tardanzas ANTES de montar la grid, para que initialData siembre los
      // "1" y las horas de denegadas con lo ultimo que hay en la nube.
      await Promise.all([refreshMarksFor(cuad.periodo, cuad.quincena), refreshTardies()]);
      const existing = ca.find(a => a.periodo === cuad.periodo && a.quincena === cuad.quincena);
      // La cuadrilla es la fuente de verdad de las asignaciones empleado→proyecto:
      // al abrir se refrescan los assignments; grid/overrides se conservan.
      if (existing) setModal({ t: "ag", d: { ...existing, assignments: cuad.assignments } });
      else setModal({ t: "ag", d: { id: uid(), company: co, periodo: cuad.periodo, quincena: cuad.quincena, assignments: cuad.assignments, grid: {}, date: new Date().toISOString() } });
    };
    // Hojas huérfanas: asistencias de esta empresa cuya quincena ya no tiene
    // cuadrilla. Guardan sus propios assignments, así que se abren igual.
    const orphanAtts = ca.filter(a => !cq.some(c => c.periodo === a.periodo && c.quincena === a.quincena));
    const filas = cq.slice().sort((a, b) => `${b.periodo}-${b.quincena}`.localeCompare(`${a.periodo}-${a.quincena}`));
    const chipGris = { fontSize: 11, fontWeight: 600, color: "#6E6862", background: "rgba(44,42,40,.06)", borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap" };
    return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, color: "#6E6862" }}>{cq.length} quincena{cq.length === 1 ? "" : "s"} con cuadrilla · {ca.length} con asistencia registrada</span>
        {!isReadOnly && btnH("+ Cuadrilla de la quincena", () => setModal({ t: "cuad" }), { c: ORANGE_DARK, lleno: true, chico: true })}
      </div>
      {cq.length === 0 && <div className="gt-vidrio" style={{ padding: 28, textAlign: "center", fontSize: 13, color: "#6E6862" }}>Primero armá la cuadrilla de la quincena: quién trabaja en qué proyecto. Después se abre la hoja de asistencia.</div>}
      {orphanAtts.length > 0 && <div className="gt-vidrio" style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ font: "700 13px/1.2 var(--sans)", color: CHARCOAL }}>Hojas sin cuadrilla <span style={{ color: "#A39C92", fontWeight: 600 }}>{orphanAtts.length}</span></div>
        <div style={{ fontSize: 12, color: "#6E6862" }}>Quedaron sin su cuadrilla, pero la asistencia está intacta: se abren igual y se puede reconstruir la cuadrilla desde la propia hoja.</div>
        {orphanAtts.slice().reverse().map(a => <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 0", borderTop: "1px solid rgba(44,42,40,.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <b style={{ fontSize: 13, color: CHARCOAL }}>{etiquetaCorta(a.periodo, a.quincena)}</b>
            <span style={{ fontSize: 11.5, color: "#6E6862" }}>{Object.keys(a.assignments || {}).length} colaboradores · {Object.keys(a.grid || {}).length} celdas{a.lastSaved ? ` · guardada ${fmt(a.lastSaved.slice(0, 10))}` : ""}</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {btnH("Abrir", async () => { await Promise.all([refreshMarksFor(a.periodo, a.quincena), refreshTardies()]); setModal({ t: "ag", d: { ...a } }); }, { c: ORANGE_DARK, lleno: true, chico: true })}
            {!isReadOnly && btnH("Reconstruir cuadrilla", async () => {
              const asg = { ...(a.assignments || {}) };
              const n = Object.values(asg).filter(Boolean).length;
              if (!n) return alert("Esta hoja no tiene asignaciones de proyecto guardadas — hay que armar la cuadrilla a mano.");
              const proys = [...new Set(Object.values(asg).filter(Boolean))];
              if (!confirm(`¿Reconstruir la cuadrilla ${a.quincena} ${a.periodo} de ${cc.name} desde esta asistencia?\n\n${n} colaborador(es) en ${proys.length} proyecto(s):\n${proys.map(p => "  · " + p).join("\n")}`)) return;
              const record = { id: uid(), company: a.company, periodo: a.periodo, quincena: a.quincena, assignments: asg, date: new Date().toISOString() };
              const sinEsta = cuadrillas.filter(c => !(c.company === a.company && c.periodo === a.periodo && c.quincena === a.quincena));
              const ok = await sCq([...sinEsta, record]);
              alert(ok ? `Cuadrilla ${a.quincena} ${a.periodo} reconstruida y verificada en la nube.` : "No se pudo guardar la cuadrilla en la nube. Revisá tu conexión y volvé a intentar.");
            }, { chico: true })}
            {userRole === "admin" && btnH("Borrar", async () => {
              if (!confirm(`¿Borrar DEFINITIVAMENTE la asistencia ${a.quincena} ${a.periodo} de ${cc.name} (${Object.keys(a.grid || {}).length} celdas)?\n\nEsta acción NO se puede deshacer.`)) return;
              const ok = await sA(atts.filter(x => x.id !== a.id));
              if (!ok) alert("Se borró en este dispositivo pero NO se sincronizó a la nube. Reintentá cuando tengas conexión.");
            }, { c: "#B03024", chico: true })}
          </div>
        </div>)}
      </div>}
      {filas.map(r => {
        const a = r.assignments || {};
        const n = Object.values(a).filter(Boolean).length;
        const ps = [...new Set(Object.values(a).filter(Boolean))];
        const has = ca.find(x => x.periodo === r.periodo && x.quincena === r.quincena);
        return <div key={r.id} className="gt-vidrio" style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", flexWrap: "wrap" }}>
          <div style={{ width: 86, flexShrink: 0 }}>
            <div style={{ font: "800 22px/1 var(--display)", color: CHARCOAL }}>{r.quincena}</div>
            <div style={{ fontSize: 11.5, color: "#6E6862", marginTop: 4 }}>{mesLabel(r.periodo)}</div>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: CHARCOAL }}>{n} colaborador{n === 1 ? "" : "es"} · {ps.length} proyecto{ps.length === 1 ? "" : "s"}</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>{ps.slice(0, 5).map(p => <span key={p} style={chipGris}>{p}</span>)}{ps.length > 5 && <span style={chipGris}>+{ps.length - 5}</span>}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {has ? chipH("Registrada", "verde") : chipH("Sin registrar", "naranja")}
            {has?.lastSaved && <span style={{ fontSize: 11.5, color: "#A39C92" }}>guardada {fmt(has.lastSaved.slice(0, 10))}</span>}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {btnH("Asistencia", () => openGrid(r), { c: ORANGE_DARK, lleno: true, chico: true })}
            {!isReadOnly && btnH("Cuadrilla", () => setModal({ t: "cuad-edit", d: r }), { chico: true })}
            {!isReadOnly && btnH("✕", async () => {
              const msg = `¿Eliminar la cuadrilla ${r.quincena} ${r.periodo}?` + (has ? "\n\nOJO: esta quincena YA tiene asistencia registrada. Sin la cuadrilla, la hoja queda en \"Hojas sin cuadrilla\" (no se borra). Lo normal es NO borrar." : "");
              if (!confirm(msg)) return;
              const ok = await sCq(cuadrillas.filter(x => x.id !== r.id));
              if (!ok) alert("Se eliminó en este dispositivo pero NO se sincronizó a la nube. Reintentá cuando tengas conexión.");
            }, { c: "#B03024", chico: true, title: "Eliminar cuadrilla" })}
          </div>
        </div>;
      })}
    </div>;
  };

  // ═══════════════════════════════════════════════════════════════════
  // REPORTE DE LLEGADAS TARDÍAS (GeoClock → RRHH, ago 2026)
  // ═══════════════════════════════════════════════════════════════════
  // Marcajes de entrada DESPUÉS de la tolerancia (10 min sobre el horario
  // del empleado). RRHH decide: APROBAR = permiso, día completo pagado;
  // DENEGAR = descuento proporcional en la asistencia (mismo mecanismo de
  // José Miguel: la hora real de llegada va a arrivalTimes de la hoja).
  const renderTardanzas = () => {
    // Rango temporal: por default se ven las quincenas RECIENTES (actual +
    // anterior). Con el filtro de mes o fecha exacta se ve el ARCHIVO de ese
    // período (el useEffect de tardMes/tardFecha ya cargó esas quincenas).
    const q0 = getQuincena(hoyTegus());
    const q1 = quincenaAnterior(q0.periodo, q0.quincena);
    const enRangoTard = (mk) => {
      if (tardFecha) return mk.fecha === tardFecha;
      if (tardMes) return String(mk.fecha || "").slice(0, 7) === tardMes;
      const qm = getQuincena(mk.fecha);
      return (qm.periodo === q0.periodo && qm.quincena === q0.quincena)
        || (qm.periodo === q1.periodo && qm.quincena === q1.quincena);
    };
    const marcasTarde = Object.values(gcMarks).flat()
      .filter(mk => mk && mk.tipo === "entrada" && mk.tarde && mk.company === co && enRangoTard(mk))
      .sort((a, b) => String(b.ts || b.fecha).localeCompare(String(a.ts || a.fecha)));
    // Registro en gc-tardies (puede tener estado "pendiente" = decisión
    // REVERTIDA que conserva el historial). Solo aprobada/denegada cuentan
    // como DECIDIDAS.
    const registroDe = (mk) => (gcTardies || []).find(t => t && t.markId === mk.id) || null;
    const decisionDe = (mk) => {
      const t = registroDe(mk);
      return t && (t.estado === "aprobada" || t.estado === "denegada") ? t : null;
    };
    // ── Responsables de decisión (18-ago-2026) ──
    // Gerson (admin/coordinador) y la Lic. Carolina (tesoreria) deciden y
    // revierten TODAS. Oscar decide las marcadas desde SU cuenta (tablet de
    // plantel/almacén); Ana las de su cuenta y las de la tablet de oficina
    // (usuario "Marcaje de Asistencia"). El resto solo visualiza.
    const esSuperTardies = userRole === "admin" || userRole === "coordinador" || userRole === "tesoreria";
    const responsableDe = (mk) => {
      const por = String(mk.registradoPor || "");
      if (por === "Oscar Paz") return "Oscar Paz";
      if (por === "Ana Vasquez" || por === "Marcaje de Asistencia") return "Ana Vasquez";
      return null; // marcada por Gerson/otros → la deciden los supers
    };
    const puedeDecidir = (mk) => esSuperTardies || (!!userName && responsableDe(mk) === userName);
    // BORRAR marcajes tarde (pruebas / errores): SOLO Gerson (pedido 18-ago
    // — "que me des a mí nada más la opción"). Elimina el marcaje del reloj,
    // su firma y la decisión; si estaba denegada, limpia la hora aplicada.
    const puedeBorrarTardanza = userName === "Lic. Gerson Trochez";
    const borrarTardanza = async (mk, dec) => {
      if (!puedeBorrarTardanza) return;
      if (!confirm(`🗑 ¿Borrar DEFINITIVAMENTE la llegada tarde de ${mk.empNombre || en(mk.empId)} del ${fmt(mk.fecha)} (marcó ${mk.hora})?\n\nSe elimina el marcaje del reloj (también desaparece de Registros de GeoClock), su firma y la decisión${dec && dec.estado === "denegada" ? ", y se quita la hora fijada en la asistencia" : ""}.\n\nEs para PRUEBAS o marcajes erróneos — NO se puede deshacer. Si la asistencia ya se guardó con el "1" sembrado por este marcaje, revisala a mano.`)) return;
      // 1) Si estaba denegada, limpiar la hora aplicada en la hoja.
      if (dec && dec.estado === "denegada") {
        const r = await marcarTardanzaEnAsistencia(mk.empId, mk.fecha, dec.horaAplicada || mk.hora, "limpiar");
        if (r.sinNube) return alert("⚠️ Sin conexión con la nube — no se borró nada. Reintentá.");
      }
      // 2) Quitar el marcaje de su key de quincena (getCloud → filtrar → verify).
      const { periodo, quincena } = getQuincena(mk.fecha);
      const key = gcMarkKey(periodo, quincena);
      let cloudArr;
      try { const c = await store.getCloud(key); cloudArr = Array.isArray(c) ? c : []; }
      catch { return alert("⚠️ Sin conexión con la nube — no se borró nada. Reintentá."); }
      const next = cloudArr.filter(x => x && x.id !== mk.id);
      const ok = await store.set(key, next);
      let verified = false;
      try { const back = await store.getCloud(key); verified = Array.isArray(back) && !back.some(x => x && x.id === mk.id); } catch { verified = false; }
      if (!ok || !verified) return alert("⚠️ No se pudo VERIFICAR el borrado en la nube — reintentá.");
      setGcMarks(prev => ({ ...prev, [`${periodo}|${quincena}`]: next }));
      // 3) Borrar la decisión (si había) y vaciar la firma (best effort).
      if (registroDe(mk)) await sGcTardies({ remove: mk.id });
      // Firma: se BORRA la fila (store.remove). Antes se hacia set(..., null)
      // y la columna `value` es NOT NULL → 400 + banner rojo falso, aunque el
      // marcaje ya se habia borrado y verificado arriba. quiet: si el borrado
      // de la firma falla, es basura huerfana — no vale asustar al usuario.
      if (mk.firmaId) await store.remove(`gc-firma-${mk.firmaId}`, { quiet: true });
      alert("🗑 Marcaje tarde eliminado por completo.");
    };
    // ── Filtros (persona / responsable) — el de estado gatea las secciones ──
    const filtrar = (lista) => lista.filter(mk => {
      if (tardPersona && mk.empId !== tardPersona) return false;
      if (tardResp && (responsableDe(mk) || "supers") !== tardResp) return false;
      return true;
    });
    const pendientes = filtrar(marcasTarde.filter(mk => !decisionDe(mk)));
    const decididasTodas = filtrar(marcasTarde.filter(mk => decisionDe(mk)));
    const decididas = decididasTodas.filter(mk => {
      if (tardEstado === "aprobadas") return decisionDe(mk).estado === "aprobada";
      if (tardEstado === "denegadas") return decisionDe(mk).estado === "denegada";
      return true;
    });
    const personasConTarde = [...new Map(marcasTarde.map(mk => [mk.empId, mk.empNombre || en(mk.empId)])).entries()]
      .sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    const empDe = (mk) => emps.find(e => e.id === mk.empId) || null;
    const descuentoDe = (mk, e) => {
      // El atraso se cuenta desde que VENCE LA TOLERANCIA (horaLimiteH), no
      // desde la hora de entrada: marcar 8:20 con horario 8:00 y 15 min de
      // gracia = 5 min de descuento. Tope 8h: nunca más que el día completo.
      const [h, mm] = String(mk.hora || "0:00").split(":").map(Number);
      const horasTarde = Math.min(8, Math.max(0, (h || 0) + (mm || 0) / 60 - horaLimiteH(e)));
      const sd = ((Number(e?.salary) || 0)) / 30;
      return { horasTarde, monto: (horasTarde / 8) * sd };
    };
    // Minutos tarde a mostrar: recalculados desde hora + horarioEntrada del
    // propio marcaje (los guardados antes del 19-ago traen la cuenta vieja).
    const minTardeMk = (mk) => minTardeDe(mk?.hora, mk?.horarioEntrada || horarioDe(empDe(mk)).entrada);
    const refrescar = async () => {
      const q0 = getQuincena(hoyTegus());
      const q1 = quincenaAnterior(q0.periodo, q0.quincena);
      await Promise.all([refreshMarksFor(q0.periodo, q0.quincena), refreshMarksFor(q1.periodo, q1.quincena), refreshTardies()]);
    };
    const verFirma = async (mk) => {
      if (firmaCache[mk.id]) { setFirmaCache(p => { const n = { ...p }; delete n[mk.id]; return n; }); return; }
      try {
        const f = await store.get(`gc-firma-${mk.firmaId || mk.id}`);
        if (f?.dataUrl) setFirmaCache(p => ({ ...p, [mk.id]: f.dataUrl }));
        else alert("No se encontró la firma de este marcaje.");
      } catch { alert("No se pudo cargar la firma — revisá tu conexión."); }
    };
    const aprobar = async (mk) => {
      if (!puedeDecidir(mk)) return alert(`Esta tardanza la decide ${responsableDe(mk) || "Gerson / Lic. Carolina"}.`);
      if (!confirm(`¿APROBAR la explicación de ${mk.empNombre || en(mk.empId)}?\n\nLlegó ${mk.minTarde || "?"} min tarde el ${fmt(mk.fecha)} (marcó ${mk.hora}).\n\nEl día se paga COMPLETO — no se aplica descuento.`)) return;
      const prev = registroDe(mk);
      const nowIso = new Date().toISOString();
      const dec = {
        markId: mk.id, empId: mk.empId, fecha: mk.fecha, estado: "aprobada",
        decididoPor: userName || "RRHH", decididoAt: nowIso, fechaDecision: hoyTegus(),
        // HISTORIAL por tardanza: cada aprobación/denegación/reversión queda
        // registrada con quién y cuándo (pedido 18-ago-2026).
        historial: [...((prev && prev.historial) || []), { accion: "aprobada", por: userName || "RRHH", fecha: hoyTegus(), at: nowIso }],
      };
      const ok = await sGcTardies({ upsert: dec });
      alert(ok ? "✅ Tardanza APROBADA — el día se paga completo." : "⚠️ La decisión NO se pudo guardar en la nube. Reintentá.");
    };
    const denegar = async (mk) => {
      if (!puedeDecidir(mk)) return alert(`Esta tardanza la decide ${responsableDe(mk) || "Gerson / Lic. Carolina"}.`);
      const e = empDe(mk);
      if (!e) return alert("No se encontró al empleado de este marcaje.");
      const d = descuentoDe(mk, e);
      const montoTxt = hideSalary ? "" : `\n\nDescuento proporcional: ${fmtL(d.monto)} (${(d.horasTarde * 60).toFixed(0)} min tarde = ${(d.horasTarde / 8 * 100).toFixed(1)}% del día).`;
      if (!confirm(`¿DENEGAR la explicación de ${mk.empNombre || en(mk.empId)}?\n\nLlegó tarde el ${fmt(mk.fecha)} — marcó ${mk.hora} (su horario entra ${horarioDe(e).entrada}).${montoTxt}\n\nLa hora real quedará fijada en su asistencia y el descuento proporcional se aplica solo en planilla y Costos MO.`)) return;
      // 1) Fijar la hora en la hoja de asistencia (aborta si la nube no responde)
      const r = await marcarTardanzaEnAsistencia(mk.empId, mk.fecha, mk.hora, "aplicar");
      if (r.sinNube) return alert("⚠️ No hay conexión con la nube — NO se aplicó nada. Reintentá cuando tengas señal.");
      if (!r.ok && !r.sinHoja) return alert("⚠️ No se pudo VERIFICAR la escritura en la asistencia. NO se guardó la decisión — reintentá.");
      // 2) Guardar la decisión (con historial)
      const prev = registroDe(mk);
      const nowIso = new Date().toISOString();
      const dec = {
        markId: mk.id, empId: mk.empId, fecha: mk.fecha, estado: "denegada", horaAplicada: mk.hora,
        decididoPor: userName || "RRHH", decididoAt: nowIso, fechaDecision: hoyTegus(),
        historial: [...((prev && prev.historial) || []), { accion: "denegada", por: userName || "RRHH", fecha: hoyTegus(), at: nowIso }],
      };
      const ok = await sGcTardies({ upsert: dec });
      if (!ok) return alert("⚠️ La hora quedó en la asistencia pero la decisión NO se guardó en la nube — volvé a DENEGAR para reintentarlo (es idempotente).");
      alert(r.sinHoja
        ? "✅ Tardanza DENEGADA. La hoja de esa quincena aún no existe: la hora se fijará SOLA al crearla (queda sembrada)."
        : `✅ Tardanza DENEGADA — hora ${mk.hora} fijada en la asistencia (${r.hoja}). El descuento sale solo en planilla y Costos.`);
    };
    const revertir = async (mk, dec) => {
      if (!puedeDecidir(mk)) return alert(`Esta tardanza la decide ${responsableDe(mk) || "Gerson / Lic. Carolina"}.`);
      if (!confirm(`¿Revertir la decisión (${dec.estado.toUpperCase()}) sobre la tardanza de ${mk.empNombre || en(mk.empId)} del ${fmt(mk.fecha)}?\n\nVuelve a PENDIENTE${dec.estado === "denegada" ? " y se quita la hora fijada en la asistencia" : ""}. El historial se conserva.`)) return;
      if (dec.estado === "denegada") {
        const r = await marcarTardanzaEnAsistencia(mk.empId, mk.fecha, dec.horaAplicada || mk.hora, "limpiar");
        if (r.sinNube) return alert("⚠️ Sin conexión con la nube — no se revirtió nada. Reintentá.");
        // Mismo guard que denegar: si la limpieza de la hora NO se pudo
        // VERIFICAR, no borrar la decisión (quedaría un descuento fantasma
        // en la hoja sin registro de por qué está ahí).
        if (!r.ok && !r.sinHoja) return alert("⚠️ No se pudo verificar la limpieza de la hora en la asistencia. NO se revirtió la decisión — reintentá.");
      }
      // La reversión NO borra el registro: queda con estado "pendiente" y el
      // historial completo (quién decidió y quién revirtió, con fechas).
      const nowIso = new Date().toISOString();
      const reg = {
        markId: mk.id, empId: mk.empId, fecha: mk.fecha, estado: "pendiente",
        historial: [...((dec && dec.historial) || []), { accion: "revertida", por: userName || "RRHH", fecha: hoyTegus(), at: nowIso }],
      };
      const ok = await sGcTardies({ upsert: reg });
      alert(ok ? "↩️ Decisión revertida — la tardanza vuelve a Pendientes (el historial se conserva)." : "⚠️ No se pudo guardar la reversión en la nube. Reintentá.");
    };
    const verFoto = async (mk) => {
      const k = `foto:${mk.id}`;
      if (firmaCache[k]) { setFirmaCache(p => { const n = { ...p }; delete n[k]; return n; }); return; }
      try {
        const f = await store.get(`gc-foto-${mk.fotoId || mk.id}`);
        if (f?.dataUrl) setFirmaCache(p => ({ ...p, [k]: f.dataUrl }));
        else alert("Este marcaje no tiene foto (se tomó antes de que la tablet tuviera cámara, o la cámara no estaba disponible).");
      } catch { alert("No se pudo cargar la foto — revisá tu conexión."); }
    };
    const nAprob = decididasTodas.filter(mk => decisionDe(mk).estado === "aprobada").length;
    const nDeneg = decididasTodas.filter(mk => decisionDe(mk).estado === "denegada").length;
    const rangoTxt = tardFecha ? fmt(tardFecha) : tardMes ? mesLabel(tardMes) : "quincena actual y anterior";
    const cardTardanza = (mk, dec) => {
      const e = empDe(mk);
      const d = e ? descuentoDe(mk, e) : null;
      const reg = registroDe(mk);
      const resp = responsableDe(mk);
      return <div key={mk.id} className="gt-vidrio" style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <EmpAvatar name={mk.empNombre || en(mk.empId)} dataUrl={e?.photo?.fileId ? photoCache[e.photo.fileId] : null} size={40} borderRadius={12} suave />
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ font: "700 14px/1.2 var(--sans)", color: CHARCOAL }}>{mk.empNombre || en(mk.empId)}</div>
            <div style={{ fontSize: 12, color: "#6E6862", marginTop: 3 }}>{e?.position ? `${e.position} · ` : ""}{fmt(mk.fecha)} · horario {e ? horarioDe(e).entrada : "7:00"}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 15, color: CHARCOAL }}>{mk.hora}</span>
            {chipH(`+${minTardeMk(mk)} min`, "naranja")}
            <span title={`Marcada desde: ${mk.registradoPor || "GeoClock"}`} style={{ fontSize: 11.5, color: "#A39C92" }}>decide {resp ? resp.split(" ")[0] : "Gerson / Carolina"}</span>
            {dec ? chipH(dec.estado === "aprobada" ? "Aprobada · día completo" : "Denegada · con descuento", dec.estado === "aprobada" ? "verde" : "rojo") : chipH("Por decidir", "ambar")}
          </div>
        </div>
        <div style={{ fontSize: 13, color: CHARCOAL, padding: "8px 12px", borderRadius: 12, background: "rgba(44,42,40,.035)" }}>
          {mk.explicacion ? <>“{mk.explicacion}”</> : <span style={{ color: "#A39C92" }}>Sin explicación</span>}
        </div>
        {!hideSalary && d && <div style={{ fontSize: 12, color: dec?.estado === "aprobada" ? "#A39C92" : dec?.estado === "denegada" ? "#B03024" : "#6E6862" }}>
          {dec?.estado === "aprobada" ? "Sin descuento" : dec?.estado === "denegada" ? "Descuento aplicado" : "Si se deniega se descuenta"}: <b>{fmtL(d.monto)}</b> · {(d.horasTarde * 60).toFixed(0)} min = {(d.horasTarde / 8 * 100).toFixed(1)} % del día{e?.salary ? ` (L ${(Number(e.salary) / 30).toFixed(2)} diario)` : ""}
        </div>}
        {(firmaCache[mk.id] || firmaCache[`foto:${mk.id}`]) && <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {firmaCache[`foto:${mk.id}`] && <img src={firmaCache[`foto:${mk.id}`]} alt="Foto del marcaje" style={{ height: 120, borderRadius: 14, border: "1px solid rgba(44,42,40,.1)" }} />}
          {firmaCache[mk.id] && <img src={firmaCache[mk.id]} alt="Firma" style={{ height: 90, maxWidth: "100%", borderRadius: 12, border: "1px solid rgba(44,42,40,.1)", background: "#fff" }} />}
        </div>}
        {(reg?.historial || []).length > 0 && <div style={{ fontSize: 11.5, color: "#6E6862", display: "flex", gap: 10, flexWrap: "wrap" }}>
          {reg.historial.map((h, i) => <span key={i}>{h.accion.charAt(0).toUpperCase() + h.accion.slice(1)} por <b>{h.por}</b> · {fmt(h.fecha || String(h.at || "").slice(0, 10))}</span>)}
        </div>}
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
          {btnH(firmaCache[`foto:${mk.id}`] ? "Ocultar foto" : "Ver foto", () => verFoto(mk), { chico: true })}
          {btnH(firmaCache[mk.id] ? "Ocultar firma" : "Ver firma", () => verFirma(mk), { chico: true })}
          {!dec && puedeDecidir(mk) && <>
            {btnH("Denegar", () => denegar(mk), { c: "#B03024", chico: true })}
            {btnH("Aprobar", () => aprobar(mk), { c: "#177243", lleno: true, chico: true })}
          </>}
          {!dec && !puedeDecidir(mk) && <span style={{ fontSize: 11.5, color: "#A39C92" }}>La decide {resp || "Gerson / Lic. Carolina"}</span>}
          {dec && puedeDecidir(mk) && btnH("Revertir", () => revertir(mk, dec), { chico: true })}
          {puedeBorrarTardanza && <button type="button" onClick={() => borrarTardanza(mk, dec)} style={{ background: "none", border: "none", color: "#B03024", font: "700 12px/1 var(--sans)", cursor: "pointer", padding: "6px 4px" }}>Borrar</button>}
        </div>
        {dec && <div style={{ fontSize: 11, color: "#A39C92", textAlign: "right" }}>Decidido por {dec.decididoPor} · {fmt(dec.fechaDecision || String(dec.decididoAt || "").slice(0, 10))}</div>}
      </div>;
    };
    return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
        {tileH(pendientes.length, `por decidir · ${rangoTxt}`, pendientes.length ? "#A94E16" : CHARCOAL, () => setTardEstado("pendientes"))}
        {tileH(nAprob, "aprobadas", CHARCOAL, () => setTardEstado("aprobadas"))}
        {tileH(nDeneg, "denegadas", CHARCOAL, () => setTardEstado("denegadas"))}
        {tileH(personasConTarde.length, "colaboradores con llegadas tarde")}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6 }}>{[["", "Todas"], ["pendientes", "Por decidir"], ["aprobadas", "Aprobadas"], ["denegadas", "Denegadas"]].map(([v, l]) => pillH(l, tardEstado === v, () => setTardEstado(v), v))}</div>
        <select value={tardPersona} onChange={e => setTardPersona(e.target.value)} style={CTRL_H}>
          <option value="">Todos los colaboradores</option>
          {personasConTarde.map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
        </select>
        <select value={tardResp} onChange={e => setTardResp(e.target.value)} style={CTRL_H}>
          <option value="">Quien decide: todos</option>
          <option value="Oscar Paz">Decide Oscar (plantel / almacén)</option>
          <option value="Ana Vasquez">Decide Ana (oficina)</option>
          <option value="supers">Deciden Gerson / Lic. Carolina</option>
        </select>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {pillH("Recientes", !tardMes && !tardFecha, () => { setTardMes(""); setTardFecha(""); })}
          <input type="month" value={tardMes} onChange={e => { setTardMes(e.target.value); setTardFecha(""); }} title="Ver un mes completo" style={CTRL_H} />
          <input type="date" value={tardFecha} onChange={e => { setTardFecha(e.target.value); setTardMes(""); }} title="Ver una fecha exacta" style={CTRL_H} />
        </div>
        <div style={{ flex: 1 }} />
        {btnH("Actualizar", refrescar, { chico: true })}
      </div>
      {(!tardEstado || tardEstado === "pendientes") && <>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "4px 2px 0" }}><span style={{ font: "800 16px/1 var(--display)", color: CHARCOAL }}>Por decidir</span><span style={{ font: "600 13px/1 var(--sans)", color: "#A39C92" }}>{pendientes.length}</span></div>
        {pendientes.length === 0 && <div className="gt-vidrio" style={{ padding: 24, textAlign: "center", fontSize: 13, color: "#6E6862" }}>Nada por decidir{tardPersona || tardResp ? " con este filtro" : ""}.</div>}
        {pendientes.map(mk => cardTardanza(mk, null))}
      </>}
      {tardEstado !== "pendientes" && decididas.length > 0 && <>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "8px 2px 0" }}><span style={{ font: "800 16px/1 var(--display)", color: CHARCOAL }}>Decididas</span><span style={{ font: "600 13px/1 var(--sans)", color: "#A39C92" }}>{decididas.length}</span></div>
        {(() => {
          const porMes = {};
          decididas.forEach(mk => { const m2 = String(mk.fecha || "").slice(0, 7); (porMes[m2] = porMes[m2] || []).push(mk); });
          return Object.keys(porMes).sort((a, b) => b.localeCompare(a)).map(m2 => <div key={m2} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#6E6862", margin: "2px 2px 0" }}>{mesLabel(m2)} <span style={{ color: "#A39C92", fontWeight: 600 }}>{porMes[m2].length}</span></div>
            {porMes[m2].map(mk => cardTardanza(mk, decisionDe(mk)))}
          </div>);
        })()}
      </>}
      <div style={{ fontSize: 11.5, color: "#A39C92" }}>Denegar fija la hora real de llegada en la hoja de asistencia y el descuento sale solo en planilla y costos. Aprobar paga el día completo.</div>
    </div>;
  };

  const renderCons = () => <div style={{ display: "flex", flexDirection: "column", gap: 16 }}><div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#64748b", fontSize: 13 }}>{cc2.length} emitidas</span><Btn onClick={() => setModal({ t: "cn" })}>+ Generar</Btn></div><Table columns={[{ key: "e", label: "Empleado", render: r => en(r.employeeId) }, { key: "t", label: "Tipo", render: r => <Badge color="#6E6862">{r.type === "laboral" ? "Laboral" : "De trabajo"}</Badge> }, { key: "d", label: "Fecha", render: r => fmt(r.date) }]} data={cc2} actions={r => <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>{(!hideSalary || (r.type !== "ingresos" && r.type !== "trabajo")) && <Btn small variant="ghost" onClick={() => { const e = emps.find(x => x.id === r.employeeId); const doc = r.doc || solicitudes.find(x => x.id === r.origenSolicitud)?.resultado?.doc; pdfDeRegistroConstancia({ ...r, doc }, e); }}>PDF</Btn>}<Btn small variant="danger" onClick={() => { if (!confirm(`¿Eliminar la constancia de ${en(r.employeeId)} del ${fmt(r.date)}?`)) return; sC(cons.filter(c => c.id !== r.id)); }}>×</Btn></div>} /></div>;

  // ── MOVIMIENTOS (Altas y Bajas) ──
  const AltaForm = ({ onSave }) => {
    const [f, setF] = useState({
      company: co, fullName: "", dni: "", position: "", department: "Operaciones",
      contractType: "permanent", startDate: hoyISO(),
      endDate: "", salary: "", bonificacion: 0, motivo: "Contratacion nueva", notas: "",
      excepcional: false, payrollEffectiveDate: "",
    });
    const u = (k, v) => setF(p => ({ ...p, [k]: v }));
    const grupo = getGrupo(f.company, f.contractType);
    const esTemporal = f.contractType === "temporary";

    // Calculo de duracion para mostrar al usuario
    const duracionDias = (f.startDate && f.endDate) ? Math.max(0, Math.round((new Date(f.endDate) - new Date(f.startDate)) / 86400000) + 1) : 0;
    const duracionStr = duracionDias > 0
      ? `${duracionDias} día${duracionDias !== 1 ? "s" : ""}` +
        (duracionDias >= 7 ? ` · ~${Math.round(duracionDias / 7)} sem.` : "") +
        (duracionDias >= 30 ? ` · ~${(duracionDias / 30).toFixed(1)} meses` : "")
      : "";
    const fechasInvalidas = f.startDate && f.endDate && new Date(f.endDate) < new Date(f.startDate);
    const esHonorarios = f.contractType === "honorarios";
    const NOTA_HONORARIOS = "📌 Recordatorio: deducir 12.5% de retencion por honorarios profesionales (se aplica al pagar planilla — el salario registrado es el base).";

    // Pre-llenar nota cuando se cambia a Honorarios, si esta vacia.
    // Si el usuario cambia el tipo otra vez, mantenemos lo que tenia.
    useEffect(() => {
      if (esHonorarios && !f.notas) u("notas", NOTA_HONORARIOS);
      // si pasa de honorarios a otra cosa y la nota es exactamente la del recordatorio, limpiar
      if (!esHonorarios && f.notas === NOTA_HONORARIOS) u("notas", "");
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [esHonorarios]);

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
      <Select label="Tipo de contrato" options={[{ value: "permanent", label: "Permanente" }, { value: "temporary", label: "Temporal (por obra)" }, { value: "honorarios", label: "Honorarios" }]} value={f.contractType} onChange={e => u("contractType", e.target.value)} />

      {/* Fecha de ingreso — siempre visible */}
      {!esTemporal && <Input label="Fecha de ingreso" type="date" value={f.startDate} onChange={e => u("startDate", e.target.value)} />}

      {/* Bloque destacado de duracion para temporales (por obra determinada) */}
      {esTemporal && <div style={{ gridColumn: "1/-1", background: "#FFFBEB", border: "2px solid #F59E0B", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#92400E", letterSpacing: 0.3 }}>📅 DURACIÓN DEL CONTRATO POR OBRA</span>
          <span style={{ fontSize: 11, color: "#B45309", fontStyle: "italic" }}>(obligatorio en contratos temporales)</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "end" }}>
          <Input label="Fecha desde *" type="date" value={f.startDate} onChange={e => u("startDate", e.target.value)} />
          <Input label="Fecha hasta (vence) *" type="date" value={f.endDate} onChange={e => u("endDate", e.target.value)} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>Duración calculada</label>
            <div style={{ padding: "8px 12px", border: "1px solid #FCD34D", borderRadius: 8, background: "#fff", color: duracionDias > 0 ? "#92400E" : "#94A3B8", fontWeight: 700, fontSize: 13, minHeight: 38, display: "flex", alignItems: "center" }}>
              {duracionStr || "— completa las fechas —"}
            </div>
          </div>
        </div>
        {fechasInvalidas && <div style={{ background: "#FEE2E2", color: "#991B1B", borderRadius: 6, padding: "6px 10px", fontSize: 12, fontWeight: 600 }}>
          ⚠️ La fecha de fin no puede ser anterior a la fecha de inicio.
        </div>}
      </div>}

      <Input label={`Salario bruto (L)${esHonorarios ? " — base, sin retencion" : ""}`} type="number" value={f.salary} onChange={e => u("salary", e.target.value)} />
      <Input label="Bonificacion (L)" type="number" value={f.bonificacion} onChange={e => u("bonificacion", e.target.value)} />

      {/* Recordatorio visible cuando el tipo de contrato es Honorarios (Grupo D) */}
      {esHonorarios && <div style={{ gridColumn: "1/-1", background: "#F5F3FF", border: "2px solid #C4B5FD", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#5B21B6", letterSpacing: 0.3 }}>📌 ATENCIÓN — HONORARIOS PROFESIONALES (GRUPO D)</span>
        </div>
        <div style={{ fontSize: 12, color: "#5B21B6", lineHeight: 1.6 }}>
          Registrá el <b>salario base</b> tal como se acordó con el profesional (sin descontar nada).
          La <b>retención del 12.5% por honorarios profesionales</b> se aplica automáticamente al generar la planilla
          (no afecta el monto que ves arriba). El neto a pagar al profesional sale ya con la retención descontada.
        </div>
      </div>}

      <Select label="Motivo de alta" options={MOTIVOS_ALTA} value={f.motivo} onChange={e => u("motivo", e.target.value)} />
      <div style={{ gridColumn: "1/-1" }}>
        <Input label="Notas" value={f.notas} onChange={e => u("notas", e.target.value)} />
      </div>

      {/* Bloque "Caso excepcional" — solo para permanentes y honorarios (NO temporales) */}
      {!esTemporal && <div style={{ gridColumn: "1/-1", background: "#DBEAFE", border: "2px solid #93C5FD", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#1E3A8A", lineHeight: 1.4 }}>
          <input type="checkbox" checked={f.excepcional} onChange={e => u("excepcional", e.target.checked)} style={{ marginTop: 3 }} />
          <span>Caso excepcional: el efecto en planilla es distinto a la fecha de ingreso</span>
        </label>
        {f.excepcional && <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingLeft: 24 }}>
          <div style={{ maxWidth: 280 }}>
            <Input label="Fecha de efecto en planilla *" type="date" value={f.payrollEffectiveDate} onChange={e => u("payrollEffectiveDate", e.target.value)} />
          </div>
          <div style={{ background: "#fff", border: "1px solid #BFDBFE", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#1E3A8A", lineHeight: 1.6 }}>
            El empleado conservará su fecha de ingreso original (<b>{f.startDate ? fmt(f.startDate) : "—"}</b>) para antigüedad y contrato.
            En el reporte de Movimientos aparecerá como alta en <b>{f.payrollEffectiveDate ? fmt(f.payrollEffectiveDate) : "—"}</b> con pago proporcional.
          </div>
        </div>}
      </div>}

      <div style={{ gridColumn: "1/-1", display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
        <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
        <Btn variant="success" onClick={() => {
          if (!f.fullName || !f.dni || !f.startDate || !f.salary) return alert("Complete nombre, DNI, fecha de ingreso y salario");
          if (f.contractType === "temporary" && !f.endDate) return alert("⚠️ El contrato por obra (temporal) requiere fecha de fin del contrato.");
          if (f.contractType === "temporary" && new Date(f.endDate) < new Date(f.startDate)) return alert("⚠️ La fecha de fin no puede ser anterior a la fecha de inicio.");
          if (f.excepcional && !f.payrollEffectiveDate) return alert("⚠️ Marcaste el caso excepcional: indica la fecha de efecto en planilla.");
          if (f.excepcional && new Date(f.payrollEffectiveDate) < new Date(f.startDate)) return alert("⚠️ La fecha de efecto en planilla debe ser igual o posterior a la fecha de ingreso.");
          const empId = uid();
          const usaExcepcional = f.excepcional && !!f.payrollEffectiveDate && !esTemporal;
          // Nota automatica del caso excepcional, concatenada con la nota existente si la habia
          let notasFinal = f.notas;
          if (usaExcepcional) {
            const notaExc = `[CASO EXCEPCIONAL] Ingreso real: ${fmt(f.startDate)}. Efecto en planilla: ${fmt(f.payrollEffectiveDate)}. Primer pago proporcional al periodo trabajado en este mes.`;
            notasFinal = f.notas ? `${f.notas} | ${notaExc}` : notaExc;
          }
          const newEmp = {
            id: empId, company: f.company, fullName: f.fullName, dni: f.dni, position: f.position,
            department: f.department, contractType: f.contractType, startDate: f.startDate,
            endDate: f.endDate || "", salary: Number(f.salary), bonificacion: Number(f.bonificacion) || 0,
            cooperativa: 0, gastosMedicos: 40000, status: "active", phone: "", email: "",
            sexo: "", horario: "",
            ...(usaExcepcional ? { payrollEffectiveDate: f.payrollEffectiveDate } : {}),
          };
          sE([...emps, newEmp]);
          const mov = {
            id: uid(), tipo: "alta", company: f.company, employeeId: empId,
            fullName: f.fullName, dni: f.dni, position: f.position, contractType: f.contractType,
            grupo: getGrupo(f.company, f.contractType), salary: Number(f.salary), endDate: f.endDate || "",
            date: usaExcepcional ? f.payrollEffectiveDate : f.startDate,
            motivo: f.motivo, notas: notasFinal, createdAt: new Date().toISOString(),
            ...(usaExcepcional ? {
              payrollEffectiveDate: f.payrollEffectiveDate,
              realStartDate: f.startDate,
              proporcional: true,
            } : {}),
          };
          sM([...movs, mov]);
          // Crear contrato automaticamente vinculado al alta
          const newContract = {
            id: uid(),
            employeeId: empId,
            company: f.company,
            contractType: f.contractType,
            startDate: f.startDate,
            endDate: f.contractType === "temporary" ? (f.endDate || "") : "",
            salary: Number(f.salary),
            bonificacion: Number(f.bonificacion) || 0,
            status: "active",
            parentContractId: null,
            notes: `Generado automaticamente desde alta. Motivo: ${f.motivo}`,
            createdAt: new Date().toISOString(),
          };
          sCt([...contracts, newContract]);
          setModal(null);
        }}>Registrar alta</Btn>
      </div>
    </div>;
  };

  // Editor de movimientos ya existentes. Permite cambiar la fecha del
  // movimiento (date) y aplicar caso excepcional retroactivamente sin
  // tener que borrar el empleado y recrear el alta. Util cuando hay que
  // ajustar en que quincena/periodo cae el alta para reportes.
  const EditMovForm = ({ mov, onSave }) => {
    const [f, setF] = useState({
      date: mov.date || "",
      excepcional: !!mov.proporcional,
      payrollEffectiveDate: mov.payrollEffectiveDate || "",
      realStartDate: mov.realStartDate || mov.date || "",
      notas: mov.notas || "",
    });
    const u = (k, v) => setF(p => ({ ...p, [k]: v }));
    const q = getQuincena(f.excepcional && f.payrollEffectiveDate ? f.payrollEffectiveDate : f.date);
    const esAlta = mov.tipo === "alta";
    // La ficha del empleado es la que pinta el gris en la asistencia. Antes,
    // editar la fecha de una baja acá dejaba el reporte diciendo una fecha y la
    // hoja de asistencia gris desde otra (caso Henry: reporte 5-sep, gris desde
    // el 8). Ahora una baja SIEMPRE sincroniza el `endDate` de la ficha.
    const empFicha = esAlta ? null : emps.find(x => x.id === mov.employeeId);
    const desfase = !!(empFicha && f.date && empFicha.endDate !== f.date);

    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: "#F1F5F9", border: "1px solid #CBD5E1", borderRadius: 10, padding: 12, fontSize: 13, color: "#334155" }}>
        Editando: <b>{mov.fullName}</b> · <b>{mov.dni}</b> · {mov.position}
        <div style={{ fontSize: 11, color: "#64748B", marginTop: 4 }}>
          {esAlta
            ? "Solo se modifican los campos del movimiento. La ficha del empleado y el contrato NO se tocan."
            : "Al guardar, el último día también se actualiza en la ficha del colaborador (es el que bloquea la asistencia)."}
        </div>
      </div>

      {desfase && <div style={{ background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 10, padding: "10px 14px", fontSize: 12.5, color: "#78350F", lineHeight: 1.6 }}>
        ⚠️ La ficha de <b>{mov.fullName}</b> tiene último día <b>{empFicha.endDate ? fmt(empFicha.endDate) : "(sin fecha)"}</b> y este movimiento dice <b>{fmt(f.date)}</b>.
        Al guardar quedan las dos en <b>{fmt(f.date)}</b> y la asistencia se pone en gris desde el día siguiente.
      </div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Input label={esAlta ? "Fecha de efecto en planilla *" : "Último día del colaborador en la empresa *"} type="date" value={f.date} onChange={e => u("date", e.target.value)} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>Quincena / periodo (auto)</label>
          <div style={{ padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: 8, background: "#fff", fontWeight: 700, fontSize: 13 }}>
            {q ? `${q.quincena} ${q.periodo}` : "—"}
          </div>
        </div>
      </div>

      {/* Caso excepcional - solo para altas no temporales */}
      {esAlta && mov.contractType !== "temporary" && (
        <div style={{ background: "#DBEAFE", border: "2px solid #93C5FD", borderRadius: 10, padding: 14 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "#1E3A8A", cursor: "pointer" }}>
            <input type="checkbox" checked={f.excepcional} onChange={e => u("excepcional", e.target.checked)} />
            Caso excepcional: ingreso real distinto a fecha de efecto en planilla
          </label>
          {f.excepcional && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <Input label="Fecha de ingreso real (cuando empezo a trabajar)" type="date" value={f.realStartDate} onChange={e => u("realStartDate", e.target.value)} />
              <div style={{ fontSize: 11, color: "#1E3A8A", lineHeight: 1.5 }}>
                La fecha de arriba (efecto en planilla) determina en que quincena aparece en el reporte. La fecha de ingreso real se conserva como dato historico (no afecta antiguedad existente del empleado).
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>Notas</label>
        <textarea
          style={{ width: "100%", padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 14, minHeight: 70, fontFamily: "inherit", outline: "none" }}
          value={f.notas}
          onChange={e => u("notas", e.target.value)}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
        <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
        <Btn variant="success" onClick={() => {
          if (!f.date) return alert("La fecha es obligatoria.");
          if (f.excepcional && !f.realStartDate) return alert("Si es caso excepcional, indica la fecha de ingreso real.");
          if (f.excepcional && new Date(f.realStartDate) > new Date(f.date)) return alert("La fecha de ingreso real debe ser igual o anterior a la fecha de efecto en planilla.");
          // Construir la nota automatica si es excepcional y no esta ya
          let notasFinal = f.notas || "";
          if (f.excepcional) {
            const notaExc = `[CASO EXCEPCIONAL] Ingreso real: ${fmt(f.realStartDate)}. Efecto en planilla: ${fmt(f.date)}. Primer pago proporcional al periodo trabajado en este mes.`;
            if (!notasFinal.includes("[CASO EXCEPCIONAL]")) {
              notasFinal = notasFinal ? `${notasFinal} | ${notaExc}` : notaExc;
            }
          }
          const updated = {
            ...mov,
            date: f.date,
            notas: notasFinal,
          };
          if (f.excepcional) {
            updated.payrollEffectiveDate = f.date;
            updated.realStartDate = f.realStartDate;
            updated.proporcional = true;
          } else {
            // Si se desmarca excepcional, limpiar los campos extras
            delete updated.payrollEffectiveDate;
            delete updated.realStartDate;
            delete updated.proporcional;
          }
          onSave(updated);
          // Una BAJA sincroniza la ficha: el `endDate` del empleado es el ULTIMO
          // DIA en la empresa y es lo unico que mira la asistencia para pintar el gris.
          if (!esAlta && empFicha && empFicha.endDate !== f.date) {
            sE(emps.map(x => x.id === empFicha.id ? { ...x, status: "inactive", endDate: f.date } : x));
          }
          setModal(null);
        }}>Guardar cambios</Btn>
      </div>
    </div>;
  };

  const BajaForm = ({ onSave }) => {
    const [f, setF] = useState({
      employeeId: "", date: hoyISO(),
      motivo: "Renuncia voluntaria", notas: "",
    });
    const u = (k, v) => setF(p => ({ ...p, [k]: v }));
    const emp = ce.find(x => x.id === f.employeeId);
    const grupo = emp ? getGrupo(emp.company, emp.contractType) : "—";
    return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <div style={{ gridColumn: "1/-1" }}>
        <BuscadorEmpleado label="Empleado a dar de baja" empleados={ae.filter(e => e.status !== "inactive")} value={f.employeeId} onChange={id => u("employeeId", id)} />
      </div>
      {emp && <div style={{ gridColumn: "1/-1", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, fontSize: 13 }}>
        <div><span style={{ color: "#64748b" }}>DNI:</span> <b>{emp.dni}</b></div>
        <div><span style={{ color: "#64748b" }}>Cargo:</span> <b>{emp.position}</b></div>
        <div><span style={{ color: "#64748b" }}>Empresa:</span> <b>{COMPANIES[emp.company].name}</b></div>
        <div><span style={{ color: "#64748b" }}>Contrato:</span> <Badge color={emp.contractType === "temporary" ? "#D97706" : emp.contractType === "honorarios" ? "#7C3AED" : "#2563EB"}>{emp.contractType === "temporary" ? "Temporal" : emp.contractType === "honorarios" ? "Honorarios" : "Permanente"}</Badge></div>
        <div><span style={{ color: "#64748b" }}>Salario:</span> <b>{fmtL(emp.salary)}</b></div>
        <div><span style={{ color: "#64748b" }}>Grupo:</span> <Badge color={GRUPO_COLOR[grupo]}>{grupo} — {GRUPO_DESC[grupo]}</Badge></div>
        {emp.startDate && <div><span style={{ color: "#64748b" }}>Ingreso:</span> <b>{fmt(emp.startDate)}</b></div>}
        {emp.contractType === "temporary" && emp.endDate && (() => {
          const hoy = new Date(); hoy.setHours(0,0,0,0);
          const fin = new Date(emp.endDate); fin.setHours(0,0,0,0);
          const dias = Math.ceil((fin - hoy) / 86400000);
          const color = dias < 0 ? "#991B1B" : dias <= 7 ? "#DC2626" : dias <= 30 ? "#D97706" : "#059669";
          return <div style={{ gridColumn: "1 / -1", background: color + "15", border: `1px solid ${color}40`, borderRadius: 8, padding: "8px 12px", marginTop: 4 }}>
            <span style={{ color: "#64748b" }}>📅 Contrato vence:</span> <b style={{ color }}>{fmt(emp.endDate)}</b>
            <span style={{ color, fontWeight: 600, marginLeft: 8, fontSize: 12 }}>{dias < 0 ? `(vencido hace ${Math.abs(dias)}d)` : dias === 0 ? "(vence hoy)" : `(${dias}d restantes)`}</span>
          </div>;
        })()}
      </div>}
      {f.employeeId && <EquipoAsignadoInv empId={f.employeeId} modo="aviso" />}
      <Input label="Último día del colaborador en la empresa" type="date" value={f.date} onChange={e => u("date", e.target.value)} />
      <Select label="Motivo de baja" options={MOTIVOS_BAJA} value={f.motivo} onChange={e => u("motivo", e.target.value)} />
      {f.date && <div style={{ gridColumn: "1/-1", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 14px", fontSize: 12.5, color: "#7F1D1D", lineHeight: 1.6 }}>
        Es el <b>último día</b> que la persona estuvo en la empresa: <b>se le paga hasta el {fmt(f.date)}</b> (inclusive).
        Desde el <b>{fmt(diaSiguiente(f.date))}</b> en adelante su asistencia queda <b>en gris</b> (bloqueada) — domingos y feriados incluidos, así que no se le paga el descanso.
      </div>}
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
          // Cerrar contrato activo del empleado: status liquidated, endDate = baja
          const motivoMap = {
            "Renuncia voluntaria": "renuncia",
            "Despido": "despido",
            "Fin de contrato temporal": "fin-contrato",
            "Mutuo acuerdo": "mutuo-acuerdo",
            "Jubilacion": "otro",
            "Fallecimiento": "otro",
            "Otro": "otro",
          };
          sCt(contracts.map(c => (c.employeeId === emp.id && c.status === "active") ? {
            ...c,
            status: "liquidated",
            endDate: c.endDate || f.date,
            liquidationDate: f.date,
            liquidationReason: motivoMap[f.motivo] || "otro",
            liquidationNotes: `Liquidado desde baja de empleado. ${f.notas}`,
          } : c));
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

    // Helper: dia 1 del colaborador (startDate del empleado original).
    // - Para altas: m.date ya ES el startDate.
    // - Para bajas: buscamos el empleado por employeeId y usamos su startDate.
    //   Si el empleado ya fue eliminado, fallback a m.date.
    const getDia1 = (m) => {
      if (m.tipo === "alta") return m.date;
      const emp = emps.find(e => e.id === m.employeeId);
      return emp?.startDate || m.date;
    };

    // Helper: duracion del contrato (solo aplica para grupo B + temporal).
    // Devuelve "DD/MM/YYYY \u2192 DD/MM/YYYY" o "\u2014" segun corresponda.
    const getDuracionContrato = (m) => {
      if (m.grupo !== "B" || m.contractType !== "temporary") return "\u2014";
      const inicio = getDia1(m);
      const fin = m.endDate;
      if (!inicio || !fin) return "\u2014";
      return `${fmt(inicio)} \u2192 ${fmt(fin)}`;
    };

    const exportMovsExcel = async () => {
      try {
        const filas = filtered.map(m => {
          const q = getQuincena(m.date);
          return { tipo: m.tipo.toUpperCase(), dia1: getDia1(m) || "", fecha: m.date, q: `${q.quincena} ${q.periodo}`, grupo: m.grupo, nombre: m.fullName, dni: m.dni, pos: m.position || "",
            empresa: COMPANIES[m.company]?.name || "", contrato: m.contractType, dur: getDuracionContrato(m), salario: Number(m.salary) || 0, motivo: m.motivo || "", notas: m.notas || "" };
        });
        const wb = await libroExcel();
        hojaExcel(wb, {
          nombre: "Movimientos", titulo: `Movimientos — ${cc.name}`,
          subtitulo: `${filterPer ? `Periodo ${filterQ || ""} ${filterPer}`.replace("  ", " ") : "Todos los periodos"} · ${altas.length} altas · ${bajas.length} bajas`,
          columnas: [
            { t: "Tipo", key: "tipo", ancho: 8, formato: "texto" },
            { t: "Día 1 colaborador", key: "dia1", ancho: 13, formato: "texto" },
            { t: "Fecha movimiento", key: "fecha", ancho: 13, formato: "texto" },
            { t: "Quincena", key: "q", ancho: 12, formato: "texto" },
            { t: "Grupo", key: "grupo", ancho: 7, formato: "texto" },
            { t: "Nombre", key: "nombre", ancho: 30, formato: "texto" },
            { t: "DNI", key: "dni", ancho: 17, formato: "texto" },
            { t: "Posición", key: "pos", ancho: 22, formato: "texto" },
            { t: "Empresa", key: "empresa", ancho: 20, formato: "texto" },
            { t: "Contrato", key: "contrato", ancho: 12, formato: "texto" },
            { t: "Duración contrato", key: "dur", ancho: 24, formato: "texto" },
            { t: "Salario", key: "salario", ancho: 14, formato: "lps" },
            { t: "Motivo", key: "motivo", ancho: 24, formato: "texto" },
            { t: "Notas", key: "notas", ancho: 30, formato: "texto" },
          ],
          filas,
        });
        await descargarExcel(wb, `Movimientos_${cc.name.replace(/ /g, "_")}_${filterPer || "todos"}${filterQ ? "_" + filterQ : ""}.xlsx`);
      } catch (err) {
        alert("No se pudo generar el Excel: " + (err?.message || err));
      }
    };

    const exportMovsPDF = () => {
      const w = window.open("", "_blank");
      if (!w) { alert("Permite popups para imprimir"); return; }
      const sub = filterPer ? `Periodo: ${filterQ || ""} ${filterPer}` : "Todos los periodos";
      const salario = (m) => fmtLps(m.salary);
      const chipTipo = (m) => rChip(m.tipo.toUpperCase(), m.tipo === "alta" ? "verde" : "rojo");

      // ALTAS: muestran "Día 1 del colaborador" (startDate) + Duración contrato (solo grupo B).
      const tablaAltas = rTabla({
        columnas: [{ t: "Tipo" }, { t: "Día 1 del colaborador" }, { t: "Fecha mov." }, { t: "Q" }, { t: "Grupo" }, { t: "Nombre" }, { t: "DNI" }, { t: "Posición" }, { t: "Empresa" }, { t: "Contrato" }, { t: "Duración contrato" }, { t: "Salario", num: true }, { t: "Motivo" }, { t: "Notas" }],
        filas: altas.map(m => {
          const q = getQuincena(m.date);
          const dia1 = getDia1(m);
          const dur = getDuracionContrato(m);
          return [chipTipo(m), `<b>${dia1 ? fmt(dia1) : "—"}</b>`, `<span style="color:${RP.texto3}">—</span>`, q.quincena, rChip(m.grupo, "carbon"),
            `<b>${escHTML(m.fullName)}</b>`, `<span class="mono">${escHTML(m.dni)}</span>`, escHTML(m.position || ""), escHTML(COMPANIES[m.company]?.name || ""), escHTML(m.contractType),
            dur === "—" ? `<span style="color:${RP.texto3}">—</span>` : `<span style="white-space:nowrap;color:${RP.naranjaTexto};font-weight:700">${dur}</span>`,
            salario(m), escHTML(m.motivo || ""), `<span class="suave">${escHTML(m.notas || "")}</span>`];
        }),
      });

      // BAJAS: "Último día del colaborador en la empresa" = hasta ahí se le paga;
      // la asistencia se bloquea desde el día siguiente. Sin Duración contrato ni Fecha mov.
      const tablaBajas = rTabla({
        columnas: [{ t: "Tipo" }, { t: "Último día del colaborador en la empresa" }, { t: "Q" }, { t: "Grupo" }, { t: "Nombre" }, { t: "DNI" }, { t: "Posición" }, { t: "Empresa" }, { t: "Contrato" }, { t: "Salario", num: true }, { t: "Motivo" }, { t: "Notas" }],
        filas: bajas.map(m => {
          const q = getQuincena(m.date);
          return [chipTipo(m), `<b style="color:${RP.rojo}">${m.date ? fmt(m.date) : "—"}</b>`, q.quincena, rChip(m.grupo, "carbon"),
            `<b>${escHTML(m.fullName)}</b>`, `<span class="mono">${escHTML(m.dni)}</span>`, escHTML(m.position || ""), escHTML(COMPANIES[m.company]?.name || ""), escHTML(m.contractType),
            salario(m), escHTML(m.motivo || ""), `<span class="suave">${escHTML(m.notas || "")}</span>`];
        }),
      });

      // Resumen por grupo
      const grupoStats = {};
      ["A", "B", "C", "D"].forEach(g => grupoStats[g] = { altas: 0, bajas: 0 });
      filtered.forEach(m => { if (grupoStats[m.grupo]) grupoStats[m.grupo][m.tipo === "alta" ? "altas" : "bajas"]++; });
      const tablaGrupos = rTabla({
        columnas: [{ t: "Grupo", ancho: "60px" }, { t: "Descripción" }, { t: "Altas", num: true, ancho: "70px" }, { t: "Bajas", num: true, ancho: "70px" }, { t: "Neto", num: true, ancho: "70px" }],
        filas: ["A", "B", "C", "D"].map(g => {
          const s = grupoStats[g];
          const neto = s.altas - s.bajas;
          return [rChip(g, "carbon"), escHTML(GRUPO_DESC[g]),
            `<b style="color:${s.altas ? RP.verde : RP.texto3}">${s.altas}</b>`, `<b style="color:${s.bajas ? RP.rojo : RP.texto3}">${s.bajas}</b>`, `<b>${neto >= 0 ? "+" : ""}${neto}</b>`];
        }),
      });

      const cuerpo = rKpis([
        { label: "Altas", valor: altas.length, tono: altas.length ? "verde" : undefined },
        { label: "Bajas", valor: bajas.length, tono: bajas.length ? "rojo" : undefined },
        { label: "Neto", valor: `${altas.length - bajas.length >= 0 ? "+" : ""}${altas.length - bajas.length}` },
      ])
        + (altas.length > 0 ? rSeccion(`Altas (${altas.length})`, tablaAltas) : "")
        + (bajas.length > 0 ? rSeccion(`Bajas (${bajas.length})`, tablaBajas) : "")
        + rSeccion("Resumen por grupo", tablaGrupos);
      abrirReporte(w, reporteHTML({ titulo: "Reporte de movimientos", subtitulo: `${cc.name} · ${sub}`, empresa: co, cuerpo, horizontal: true }));
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
        ]} data={altas.slice().reverse()} actions={r => <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          <Btn small variant="ghost" onClick={() => setModal({ t: "me", d: r })} title="Editar fecha y caso excepcional">✏️</Btn>
          <Btn small variant="danger" onClick={() => { if (confirm(`Eliminar registro de alta de ${r.fullName}?`)) sM(movs.filter(m => m.id !== r.id)); }}>×</Btn>
        </div>} />
      </div>}

      {bajas.length > 0 && <div>
        <div style={{ background: "#DC2626", color: "#fff", padding: "8px 14px", fontWeight: 700, fontSize: 13, borderRadius: "10px 10px 0 0" }}>
          BAJAS ({bajas.length})
        </div>
        <Table columns={[
          // Último día en la empresa. Si la ficha del colaborador quedó con otra
          // fecha, avisamos: la asistencia se pinta con la ficha.
          { key: "date", label: "Último día del colaborador en la empresa", render: r => {
            const ef = emps.find(x => x.id === r.employeeId);
            const desf = ef && ef.endDate && ef.endDate !== r.date;
            return <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              {fmt(r.date)}
              {desf && <span title={`La ficha dice ${fmt(ef.endDate)} — la asistencia se bloquea con esa. Editá el movimiento (✏️) y guardá para dejar las dos en ${fmt(r.date)}.`} style={{ color: "#B45309", cursor: "help" }}>⚠️</span>}
            </span>;
          } },
          { key: "q", label: "Q", render: r => { const q = getQuincena(r.date); return <Badge color="#0891B2">{q.quincena}</Badge>; } },
          { key: "grupo", label: "Grupo", render: r => <Badge color={GRUPO_COLOR[r.grupo]}>{r.grupo}</Badge> },
          { key: "fullName", label: "Nombre" },
          { key: "dni", label: "DNI" },
          { key: "position", label: "Posicion" },
          { key: "contractType", label: "Contrato", render: r => <Badge color={r.contractType === "temporary" ? "#D97706" : r.contractType === "honorarios" ? "#7C3AED" : "#2563EB"}>{r.contractType === "temporary" ? "Temporal" : r.contractType === "honorarios" ? "Honorarios" : "Permanente"}</Badge> },
          { key: "motivo", label: "Motivo" },
          { key: "notas", label: "Notas" },
        ]} data={bajas.slice().reverse()} actions={r => <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          <Btn small variant="ghost" onClick={() => setModal({ t: "me", d: r })} title="Editar fecha del movimiento">✏️</Btn>
          <Btn small variant="danger" onClick={() => { if (confirm(`Eliminar registro de baja de ${r.fullName}?`)) sM(movs.filter(m => m.id !== r.id)); }}>×</Btn>
        </div>} />
      </div>}

      {filtered.length === 0 && <div style={{ background: "#F8FAFC", border: "1px dashed #CBD5E1", borderRadius: 12, padding: 30, textAlign: "center", color: "#94A3B8" }}>
        Sin movimientos en el periodo seleccionado.
      </div>}

      {filtered.length > 0 && <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Btn small variant="ghost" onClick={exportMovsExcel}>📊 Descargar Excel</Btn>
        <Btn small variant="ghost" onClick={exportMovsPDF}>🖨️ Imprimir / PDF</Btn>
      </div>}
    </div>;
  };

  // ── CONTRATOS ──
  // Helpers para calculos de contratos
  const daysBetweenDates = (start, end) => {
    if (!start || !end) return 0;
    const s = new Date(start), e = new Date(end);
    return Math.max(0, Math.round((e - s) / 86400000) + 1);
  };
  const daysUntil = (date) => {
    if (!date) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const t = new Date(date); t.setHours(0, 0, 0, 0);
    return Math.round((t - today) / 86400000);
  };
  // Dias totales acumulados desde el inicio de la cadena (para tracking de 180 dias)
  const cumulativeDaysOf = (contract) => {
    if (!contract) return 0;
    // Encontrar el contrato raiz
    let root = contract;
    const visited = new Set();
    while (root.parentContractId && !visited.has(root.id)) {
      visited.add(root.id);
      const parent = contracts.find(c => c.id === root.parentContractId);
      if (!parent) break;
      root = parent;
    }
    // Sumar todos los contratos descendientes desde la raiz
    const today = hoyISO();
    let total = 0;
    const stack = [root];
    while (stack.length) {
      const cur = stack.pop();
      const endRef = cur.endDate || today;
      total += daysBetweenDates(cur.startDate, endRef);
      contracts.filter(c => c.parentContractId === cur.id).forEach(c => stack.push(c));
    }
    return total;
  };

  // ── PASA A PERMANENCIA (ago 2026, pedido de Gerson) ──
  // Convierte un temporal en permanente en UNA sola accion, sin crear un
  // empleado nuevo (conserva id, fotos, asistencias, HE):
  //   1. hr-emps5: contractType "permanent", endDate "" (ya no vence) —
  //      la card de Empleados lo mueve sola a la seccion PERMANENTES.
  //   2. hr-contracts: el contrato temporal activo se cierra el dia anterior
  //      a la fecha de efecto (status "renewed") y nace el contrato
  //      permanente indefinido desde la fecha de efecto.
  //   3. hr-movs: se registran AUTOMATICAMENTE los dos movimientos —
  //      BAJA del temporal (ultimo dia = dia anterior al efecto, motivo
  //      "Fin de contrato temporal") y ALTA como permanente (fecha de
  //      efecto, motivo "Conversion temporal a permanente") — asi el
  //      reporte de Movimientos refleja el cambio de grupo (B → A/C).
  const PermanenciaForm = ({ contract }) => {
    const emp = ce.find(x => x.id === contract.employeeId);
    const [fecha, setFecha] = useState(hoyISO());
    const [salario, setSalario] = useState(contract.salary ?? emp?.salary ?? "");
    const [bonif, setBonif] = useState(contract.bonificacion ?? emp?.bonificacion ?? 0);
    const [notas, setNotas] = useState("");
    const [saving, setSaving] = useState(false);
    if (!emp) return <div style={{ padding: 10, color: "#DC2626" }}>El empleado de este contrato ya no existe.</div>;
    const diaAnterior = fecha ? new Date(new Date(fecha + "T12:00").getTime() - 86400000).toISOString().slice(0, 10) : "";
    const grupoNuevo = getGrupo(emp.company, "permanent");
    const grupoViejo = getGrupo(emp.company, "temporary");
    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: "#ECFDF5", border: "1px solid #6EE7B7", borderRadius: 10, padding: 12, fontSize: 13, color: "#065F46" }}>
        <b>{emp.fullName}</b> ({emp.position || "—"}) pasa de <b>Temporal (grupo {grupoViejo})</b> a <b>Permanente (grupo {grupoNuevo})</b>.
        Su contrato temporal actual{contract.endDate ? ` (vence ${fmt(contract.endDate)})` : ""} se cierra el día anterior a la fecha de efecto.
        Días acumulados de la cadena temporal: <b>{cumulativeDaysOf(contract)}</b>.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Input label="Fecha de efecto de la permanencia" type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
        <Input label="Salario bruto como permanente (L)" type="number" value={salario} onChange={e => setSalario(e.target.value)} />
        <Input label="Bonificación (L)" type="number" value={bonif} onChange={e => setBonif(e.target.value)} />
        <Input label="Notas (opcional)" value={notas} onChange={e => setNotas(e.target.value)} />
      </div>
      <div style={{ background: "#EFF6FF", border: "1px solid #93C5FD", borderRadius: 10, padding: 11, fontSize: 12, color: "#1E40AF", lineHeight: 1.5 }}>
        Se registrará automáticamente en <b>Movimientos</b>: BAJA del temporal el <b>{diaAnterior ? fmt(diaAnterior) : "—"}</b> (fin de contrato temporal)
        y ALTA como permanente el <b>{fecha ? fmt(fecha) : "—"}</b> (conversión temporal a permanente). El colaborador conserva su ficha, fotos, asistencias y horas extras.
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Btn variant="ghost" onClick={() => setModal(null)} disabled={saving}>Cancelar</Btn>
        <Btn variant="success" disabled={saving} onClick={async () => {
          if (saving) return;
          if (!fecha) return alert("Indicá la fecha de efecto de la permanencia.");
          if (!salario || Number(salario) <= 0) return alert("Indicá el salario como permanente.");
          if (!confirm(`¿Pasar a ${emp.fullName} a PERMANENTE con efecto ${fmt(fecha)}?\n\n• Contrato temporal se cierra el ${fmt(diaAnterior)}\n• Nuevo contrato permanente indefinido desde ${fmt(fecha)}\n• Salario: L ${Number(salario).toLocaleString("es-HN")}\n• Movimientos: baja (${grupoViejo}) + alta (${grupoNuevo}) automáticos`)) return;
          setSaving(true);
          const ts = new Date().toISOString();
          // 1) Ficha del empleado: permanente, sin vencimiento
          const ok1 = await sE(emps.map(x => x.id === emp.id ? { ...x, contractType: "permanent", endDate: "", salary: Number(salario), bonificacion: Number(bonif) || 0, status: "active" } : x));
          // 2) Contratos: cerrar el temporal + crear el permanente
          const nuevoContrato = {
            id: uid(), employeeId: emp.id, company: emp.company, contractType: "permanent",
            startDate: fecha, endDate: "", salary: Number(salario), bonificacion: Number(bonif) || 0,
            status: "active", parentContractId: null,
            notes: `Conversión a permanencia (efecto ${fmt(fecha)}).${notas ? " " + notas : ""}`,
            createdAt: ts,
          };
          const ok2 = await sCt([
            ...contracts.map(c => c.id === contract.id ? { ...c, status: "renewed", endDate: diaAnterior, liquidationReason: "conversion-permanente" } : c),
            nuevoContrato,
          ]);
          // 3) Movimientos automaticos: baja temporal + alta permanente
          const base = { employeeId: emp.id, fullName: emp.fullName, dni: emp.dni || "", position: emp.position || "", company: emp.company, createdAt: ts };
          const movBaja = { id: uid(), tipo: "baja", ...base, contractType: "temporary", grupo: grupoViejo, salary: Number(contract.salary) || Number(emp.salary) || 0, endDate: diaAnterior, date: diaAnterior, motivo: "Fin de contrato temporal", notas: `Conversión a permanencia — pasa a permanente el ${fmt(fecha)}.${notas ? " " + notas : ""}` };
          const movAlta = { id: uid(), tipo: "alta", ...base, contractType: "permanent", grupo: grupoNuevo, salary: Number(salario), endDate: "", date: fecha, motivo: "Conversion temporal a permanente", notas: `Era temporal desde ${fmt(emp.startDate)} (${cumulativeDaysOf(contract)} días acumulados).${notas ? " " + notas : ""}` };
          const ok3 = await sM([...movs, movBaja, movAlta]);
          setSaving(false);
          if (!ok1 || !ok2 || !ok3) { alert("⚠ Algo no se sincronizó a la nube (ficha " + (ok1 ? "✓" : "✗") + ", contratos " + (ok2 ? "✓" : "✗") + ", movimientos " + (ok3 ? "✓" : "✗") + "). Recargá la página y verificá."); return; }
          setModal(null);
          alert(`⭐ ${emp.fullName} es PERMANENTE desde ${fmt(fecha)}.\n\n✓ Ficha actualizada (ya aparece en la sección Permanentes)\n✓ Contrato permanente indefinido creado\n✓ Movimientos registrados: baja ${grupoViejo} (${fmt(diaAnterior)}) + alta ${grupoNuevo} (${fmt(fecha)})`);
        }}>{saving ? "Guardando…" : "⭐ Confirmar permanencia"}</Btn>
      </div>
    </div>;
  };

  const ContractForm = ({ contract, parent, presetEmpId, onSave }) => {
    const inheritFromParent = !!parent;
    const presetEmp = presetEmpId ? ce.find(x => x.id === presetEmpId) : null;
    const [f, setF] = useState(contract || {
      employeeId: parent?.employeeId || presetEmpId || "",
      company: parent?.company || presetEmp?.company || co,
      contractType: parent?.contractType || presetEmp?.contractType || (co === "geotecnica" ? "permanent" : "temporary"),
      startDate: parent ? (parent.endDate ? new Date(new Date(parent.endDate).getTime() + 86400000).toISOString().slice(0, 10) : "") : (presetEmp?.startDate || hoyISO()),
      endDate: presetEmp?.endDate || "",
      salary: parent?.salary || presetEmp?.salary || "",
      bonificacion: parent?.bonificacion || presetEmp?.bonificacion || 0,
      notes: "",
      parentContractId: parent?.id || null,
    });
    const u = (k, v) => setF(p => ({ ...p, [k]: v }));
    const emp = ce.find(x => x.id === f.employeeId);
    const isPermOrHon = f.contractType === "permanent" || f.contractType === "honorarios";
    const days = !isPermOrHon && f.startDate && f.endDate ? daysBetweenDates(f.startDate, f.endDate) : 0;

    // Tipos de contrato disponibles segun empresa
    const typeOpts = f.company === "geotecnica"
      ? [{ value: "permanent", label: "Permanente" }, { value: "honorarios", label: "Honorarios" }]
      : [{ value: "permanent", label: "Permanente" }, { value: "temporary", label: "Obra / Tiempo determinado" }];

    return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      {inheritFromParent && (
        <div style={{ gridColumn: "1/-1", background: "#FEF3C7", border: "1px solid #FBBF24", borderRadius: 10, padding: 12, fontSize: 13, color: "#92400E" }}>
          <strong>Renovación de contrato</strong> de <b>{en(parent.employeeId)}</b>. Días acumulados al iniciar esta renovación: <b>{cumulativeDaysOf(parent)}</b>.
        </div>
      )}
      <Select label="Empleado" options={ce.map(e => ({ value: e.id, label: `${e.fullName} — ${e.position}` }))} value={f.employeeId} onChange={e => u("employeeId", e.target.value)} />
      <Select label="Tipo de contrato" options={typeOpts} value={f.contractType} onChange={e => u("contractType", e.target.value)} />
      <Input label="Fecha inicio" type="date" value={f.startDate} onChange={e => u("startDate", e.target.value)} />
      {!isPermOrHon && <Input label="Fecha fin" type="date" value={f.endDate} onChange={e => u("endDate", e.target.value)} />}
      {/* Montos ocultos para roles sin acceso (Ana): puede crear y renovar
          contratos, pero el salario/bonificación se HEREDAN del empleado y
          NO se tocan al guardar (ver el sE de más abajo). */}
      {hideSalary ? (
        <div style={{ gridColumn: "1/-1", fontSize: 12, color: "#64748b", background: "#F8FAFC", border: "1px dashed #CBD5E1", borderRadius: 8, padding: "9px 13px" }}>
          🔒 El salario y la bonificación no se muestran con tu usuario — el contrato conserva los del colaborador.
        </div>
      ) : (<>
        <Input label="Salario bruto (L)" type="number" value={f.salary} onChange={e => u("salary", e.target.value)} />
        <Input label="Bonificacion (L)" type="number" value={f.bonificacion} onChange={e => u("bonificacion", e.target.value)} />
      </>)}
      {!isPermOrHon && days > 0 && (
        <div style={{ gridColumn: "1/-1", background: "#EFF6FF", padding: 10, borderRadius: 8, fontSize: 13, color: "#1E40AF" }}>
          Duración: <b>{days} días</b>{inheritFromParent && <> · Acumulado total proyectado: <b>{cumulativeDaysOf(parent) + days} días</b></>}
        </div>
      )}
      <div style={{ gridColumn: "1/-1" }}>
        <Input label="Notas" value={f.notes} onChange={e => u("notes", e.target.value)} />
      </div>
      <div style={{ gridColumn: "1/-1", display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
        <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
        <Btn variant="success" onClick={() => {
          // Con hideSalary el monto se hereda del contrato que se edita, del
          // padre que se renueva o de la ficha del colaborador — el usuario
          // sin acceso a montos NUNCA los digita ni los pisa.
          const empDelForm = emps.find(x => x.id === f.employeeId);
          const salarioEfectivo = hideSalary
            ? Number(contract?.salary ?? parent?.salary ?? empDelForm?.salary ?? 0)
            : Number(f.salary);
          const bonifEfectiva = hideSalary
            ? Number(contract?.bonificacion ?? parent?.bonificacion ?? empDelForm?.bonificacion ?? 0) || 0
            : Number(f.bonificacion) || 0;
          if (!f.employeeId || !f.startDate) return alert("Complete empleado y fecha de inicio");
          if (!hideSalary && !f.salary) return alert("Complete el salario");
          if (hideSalary && !salarioEfectivo) return alert("Este colaborador no tiene salario registrado en su ficha — pedile a administración que lo cargue antes de crear el contrato.");
          if (!isPermOrHon && !f.endDate) return alert("Indique fecha de fin del contrato");
          if (!isPermOrHon && f.endDate < f.startDate) return alert("La fecha de fin debe ser posterior a la fecha de inicio");
          const newC = {
            id: contract?.id || uid(),
            employeeId: f.employeeId,
            company: f.company,
            contractType: f.contractType,
            startDate: f.startDate,
            endDate: isPermOrHon ? "" : f.endDate,
            salary: salarioEfectivo,
            bonificacion: bonifEfectiva,
            status: "active",
            parentContractId: f.parentContractId || null,
            notes: f.notes || "",
            createdAt: contract?.createdAt || new Date().toISOString(),
          };
          if (contract) {
            sCt(contracts.map(x => x.id === contract.id ? newC : x));
          } else {
            // Si es renovacion, marcar el padre como "renewed"
            let updated = [...contracts];
            if (parent) updated = updated.map(x => x.id === parent.id ? { ...x, status: "renewed" } : x);
            updated.push(newC);
            sCt(updated);
          }
          // SINCRONIZAR LA FICHA DEL EMPLEADO (fix ago 2026): el contrato
          // activo manda — antes Renovar solo escribia hr-contracts y la
          // card de Empleados (que lee endDate/contractType/salary de
          // hr-emps5) seguia mostrando "vencido Xd" con la fecha vieja.
          // startDate del empleado NO se toca (es su ingreso original) y
          // status tampoco (no revivir inactivos por accidente).
          sE(emps.map(x => x.id === f.employeeId ? {
            ...x,
            contractType: f.contractType,
            endDate: isPermOrHon ? "" : f.endDate,
            // Sin acceso a montos: NO se tocan los del empleado.
            ...(hideSalary ? {} : { salary: Number(f.salary), bonificacion: Number(f.bonificacion) || 0 }),
          } : x));
          setModal(null);
        }}>{contract ? "Guardar" : (inheritFromParent ? "Renovar contrato" : "Crear contrato")}</Btn>
      </div>
    </div>;
  };

  // ── Bonificaciones: helpers ──
  // Devuelve el monto MENSUAL total de bonos activos para un empleado en
  // un periodo dado. Politica Geotecnica: si el bono esta activo al menos
  // un dia dentro de la quincena, se paga completo (no se prorratea).
  // El monto retornado es MENSUAL, la planilla lo divide /2 igual que el
  // bono base del empleado.
  const monthlyBonusFor = (employeeId, periodStart, periodEnd) => {
    return bonifs
      .filter((b) => b.employeeId === employeeId && b.status === "active")
      .filter((b) => {
        // Activo al menos un dia en el rango del periodo
        if (b.startDate && b.startDate > periodEnd) return false;
        if (b.endDate && b.endDate < periodStart) return false;
        return true;
      })
      .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  };

  // ── Aplicar Snapshot Subterra Mayo 2026 (idempotente) ──
  const applySubterraSnapshot = () => {
    const cleanDni = (s) => String(s || "").replace(/[^\d-]/g, "");
    if (!confirm(`Aplicar snapshot Subterra Honduras del ${SUBTERRA_SNAPSHOT_DATE}?\n\n` +
      `${SUBTERRA_SNAPSHOT.length} empleados serán procesados:\n` +
      `• Match por DNI: empleados existentes se actualizan, no se duplican\n` +
      `• Empleados nuevos (Yony) se crean automáticamente\n` +
      `• Contratos activos existentes se PRESERVAN (Henry y Junior no se sobrescriben)\n` +
      `• Es idempotente: podés correrlo 2 veces sin riesgo`
    )) return;

    let updatedEmps = [...emps];
    let newContracts = [...contracts];
    let newMovs = [...movs];
    let createdEmps = 0, updatedEmpsCount = 0, createdContracts = 0, preservedContracts = 0;
    const today = new Date().toISOString();

    SUBTERRA_SNAPSHOT.forEach((entry) => {
      const targetDni = cleanDni(entry.dni);
      let emp = updatedEmps.find((e) => cleanDni(e.dni) === targetDni && e.company === "subterra");

      if (!emp) {
        // Crear empleado nuevo
        const snapshotSalary = Number(entry.salary) || 0;
        emp = {
          id: uid(),
          company: "subterra",
          fullName: entry.name,
          dni: entry.dni,
          position: entry.position,
          department: "Operaciones",
          contractType: entry.contractType,
          startDate: entry.startDate,
          endDate: entry.endDate || "",
          salary: snapshotSalary,
          bonificacion: 0,
          cooperativa: 0,
          gastosMedicos: 40000,
          status: "active",
          phone: "",
          email: "",
        };
        updatedEmps.push(emp);
        createdEmps++;
        // Generar movimiento de alta
        newMovs.push({
          id: uid(),
          tipo: "alta",
          company: "subterra",
          employeeId: emp.id,
          fullName: emp.fullName,
          dni: emp.dni,
          position: emp.position,
          contractType: emp.contractType,
          grupo: getGrupo("subterra", emp.contractType),
          salary: snapshotSalary,
          endDate: emp.endDate,
          date: emp.startDate,
          motivo: "Contratacion nueva",
          notas: `Alta automática desde Snapshot ${SUBTERRA_SNAPSHOT_DATE}.${snapshotSalary === 0 ? " ⚠️ Configurar salario." : ""}`,
          createdAt: today,
        });
      } else {
        // Actualizar campos del empleado (preserva bonif, cooperativa).
        // El salario se actualiza solo si esta en 0 (placeholder) y el snapshot
        // tiene un valor — asi se preserva el salario real ya configurado.
        const idx = updatedEmps.findIndex((x) => x.id === emp.id);
        const prev = updatedEmps[idx];
        const snapshotSalary = Number(entry.salary) || 0;
        const updateSalary = (Number(prev.salary) || 0) === 0 && snapshotSalary > 0;
        const changed =
          prev.fullName !== entry.name ||
          prev.position !== entry.position ||
          prev.contractType !== entry.contractType ||
          prev.startDate !== entry.startDate ||
          (prev.endDate || "") !== (entry.endDate || "") ||
          prev.status !== "active" ||
          updateSalary;
        if (changed) {
          updatedEmps[idx] = {
            ...prev,
            fullName: entry.name,
            position: entry.position,
            contractType: entry.contractType,
            startDate: entry.startDate,
            endDate: entry.endDate || "",
            status: "active",
            salary: updateSalary ? snapshotSalary : prev.salary,
          };
          emp = updatedEmps[idx];
          updatedEmpsCount++;
        }
      }

      // Manejar contrato: si ya hay activo para este empleado, NO sobreescribir
      // — excepto si el contrato activo tiene salario 0 y el snapshot trae salario:
      // ahi sincronizamos el salario para que la planilla calcule bien.
      const existingActive = newContracts.find((c) => c.employeeId === emp.id && c.status === "active");
      if (existingActive) {
        const snapshotSalary = Number(entry.salary) || 0;
        if ((Number(existingActive.salary) || 0) === 0 && snapshotSalary > 0) {
          const cIdx = newContracts.findIndex((c) => c.id === existingActive.id);
          newContracts[cIdx] = { ...existingActive, salary: snapshotSalary };
        }
        preservedContracts++;
      } else {
        newContracts.push({
          id: uid(),
          employeeId: emp.id,
          company: "subterra",
          contractType: entry.contractType,
          startDate: entry.startDate,
          endDate: entry.endDate || "",
          salary: emp.salary || 0,
          bonificacion: emp.bonificacion || 0,
          status: "active",
          parentContractId: null,
          notes: `Aplicado desde Snapshot Subterra ${SUBTERRA_SNAPSHOT_DATE} · Grupo ${entry.grupo}`,
          createdAt: today,
        });
        createdContracts++;
      }
    });

    sE(updatedEmps);
    sCt(newContracts);
    sM(newMovs);

    alert(
      `✅ Snapshot Subterra ${SUBTERRA_SNAPSHOT_DATE} aplicado:\n\n` +
      `• ${createdEmps} empleado(s) nuevo(s) creado(s)\n` +
      `• ${updatedEmpsCount} empleado(s) actualizado(s)\n` +
      `• ${createdContracts} contrato(s) nuevo(s) creado(s)\n` +
      `• ${preservedContracts} contrato(s) activo(s) preservado(s) (Henry, Junior, etc)\n\n` +
      (createdEmps > 0 ? `⚠️ Recordá completar el SALARIO de los empleados nuevos en el módulo de Empleados.` : ``)
    );
  };

  // ═══════════════════════════════════════════════════════════════════
  // CONTRATOS (rediseño 15-oct-2026, Gerson: "feo, desordenado, mucho
  // texto; cajitas largas por empleado que se puedan compactar o desglosar;
  // es para llevar el track de los contratos por obra, cuándo vencen, y ahí
  // mismo renovar o pasar a permanencia"). Una FILA DE VIDRIO por colaborador
  // (ordenadas por urgencia); click la despliega con fechas, los 180 días,
  // historial y las acciones. Los contadores de arriba FILTRAN.
  // Sigue siendo una función (no componente): el buscador no pierde el foco.
  // ═══════════════════════════════════════════════════════════════════
  const ContractsView = () => {
    const search = contractSearch;
    const setSearch = setContractSearch;
    const empleadosConContratos = ce.map(e => {
      const empContracts = cct.filter(c => c.employeeId === e.id).sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
      const active = empContracts.find(c => c.status === "active") || null;
      return { emp: e, active, all: empContracts };
    });
    const diasDe = (x) => x.active && x.active.endDate ? daysUntil(x.active.endDate) : null;
    const GRUPOS_F = {
      vencidos: { label: "Vencidos", test: x => { const d = diasDe(x); return d !== null && d < 0; } },
      pronto: { label: "Vencen en 30 días", test: x => { const d = diasDe(x); return d !== null && d >= 0 && d <= 30; } },
      vigentes: { label: "Vigentes", test: x => { if (!x.active) return false; const d = diasDe(x); return d === null || d > 30; } },
      sin: { label: "Sin contrato", test: x => !x.active && x.emp.status === "active" },
    };
    const sinContrato = empleadosConContratos.filter(GRUPOS_F.sin.test);
    const q = search.trim().toLowerCase();
    const filtered = empleadosConContratos.filter(x => {
      if (ctFiltro && GRUPOS_F[ctFiltro] && !GRUPOS_F[ctFiltro].test(x)) return false;
      if (!q) return true;
      return (x.emp.fullName || "").toLowerCase().includes(q) || (x.emp.dni || "").toLowerCase().includes(q) || genEmpCode(x.emp.fullName, x.emp.dni).toLowerCase().includes(q);
    });
    const urgencyKey = (x) => { if (!x.active) return 900000; const d = diasDe(x); return d === null ? 800000 : d; };
    const filas = [...filtered].sort((a, b) => { const ka = urgencyKey(a), kb = urgencyKey(b); return ka !== kb ? ka - kb : (a.emp.fullName || "").localeCompare(b.emp.fullName || ""); });

    const ROJO = "#B03024";
    const estadoDe = (x) => {
      if (!x.active) return { label: "Sin contrato", color: "#6E6862", bg: "rgba(44,42,40,.06)", fila: null };
      const d = diasDe(x);
      if (d === null) return { label: "Indefinido", color: "#3E8E5A", bg: "rgba(62,142,90,.10)", fila: null };
      if (d < 0) return { label: `Venció hace ${-d} d`, color: ROJO, bg: "rgba(192,57,43,.09)", fila: "rgba(192,57,43,.045)" };
      if (d === 0) return { label: "Vence hoy", color: ROJO, bg: "rgba(192,57,43,.09)", fila: "rgba(192,57,43,.045)" };
      if (d <= 30) return { label: `Vence en ${d} d`, color: ORANGE_DARK, bg: "rgba(232,118,45,.12)", fila: "rgba(232,118,45,.05)" };
      return { label: "Vigente", color: "#3E8E5A", bg: "rgba(62,142,90,.10)", fila: null };
    };
    const tipoTxt = (t) => t === "permanent" ? "Permanente" : t === "honorarios" ? "Honorarios" : t === "temporary" ? "Por obra" : "—";
    const estadoHist = (c) => c.status === "active" ? "Activo" : c.status === "liquidated" ? "Liquidado" : c.status === "renewed" ? "Renovado" : "Cerrado";
    const toggle = (id) => setCtAbiertos(p => { const n = { ...p }; if (n[id]) delete n[id]; else n[id] = true; return n; });
    const todosAbiertos = filas.length > 0 && filas.every(x => ctAbiertos[x.emp.id]);
    const puedeEscribir = !isReadOnly;
    // Solo 3 colores (Gerson, 15-oct): rojo = vencido, naranja = alerta /
    // acción principal, verde = vigente. Nada de negro.
    const BTN = (variante) => ({ minHeight: 36, padding: "9px 16px", borderRadius: 999, border: variante === "ghost" ? "1px solid rgba(44,42,40,.14)" : "none", background: variante === "naranja" ? ORANGE : variante === "verde" ? "#3E8E5A" : "rgba(255,255,255,.8)", color: variante === "ghost" ? "#5C5853" : "#fff", font: "700 12.5px/1 var(--sans)", cursor: "pointer", whiteSpace: "nowrap" });
    const dato = (l, v) => <div style={{ minWidth: 0 }}>
      <div className="gt-label" style={{ color: "#A39C92", fontSize: 9 }}>{l}</div>
      <div style={{ font: "700 14px/1.2 var(--sans)", color: CHARCOAL, marginTop: 6 }}>{v}</div>
    </div>;

    const fila = (x, i) => {
      const { emp, active, all } = x;
      const est = estadoDe(x);
      const abierto = !!ctAbiertos[emp.id];
      const esTemp = active?.contractType === "temporary";
      const acum = active ? cumulativeDaysOf(active) : 0;
      const foto = emp.photo?.fileId ? photoCache[emp.photo.fileId] : null;
      return <div key={emp.id} className="gt-vidrio gt-sube" style={{ borderRadius: 18, overflow: "hidden", background: est.fila ? `linear-gradient(165deg, ${est.fila}, rgba(255,255,255,.7))` : undefined, animationDelay: `${Math.min(i, 14) * 22}ms` }}>
        <div role="button" tabIndex={0} aria-expanded={abierto} onClick={() => toggle(emp.id)} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggle(emp.id); } }}
          style={{ display: "grid", gridTemplateColumns: isMobile ? "40px minmax(0,1fr) auto" : "40px minmax(0,1.5fr) 100px minmax(0,1.2fr) 130px 180px", alignItems: "center", gap: isMobile ? 10 : 16, padding: isMobile ? "10px 12px" : "12px 18px", cursor: "pointer" }}>
          <EmpAvatar name={emp.fullName} dataUrl={foto} size={40} borderRadius={12} suave />
          <div style={{ minWidth: 0 }}>
            <div style={{ font: "700 14px/1.25 var(--sans)", color: CHARCOAL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{emp.fullName}</div>
            <div style={{ font: "500 12px/1.3 var(--sans)", color: "#6E6862", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{emp.position || "Sin cargo"}{isMobile ? ` · ${tipoTxt(active?.contractType)}` : ""}</div>
          </div>
          {!isMobile && <div style={{ font: "600 12.5px/1.2 var(--sans)", color: "#5C5853" }}>{tipoTxt(active?.contractType)}</div>}
          {!isMobile && <div style={{ minWidth: 0 }}>
            {active ? <span style={{ font: "500 12.5px/1 var(--sans)", color: "#6E6862" }}><b style={{ font: "800 15px/1 var(--display)", color: "#5C5853" }}>{acum.toLocaleString("es-HN")}</b> días con contrato</span>
              : <span style={{ font: "500 12px/1 var(--sans)", color: "#A39C92" }}>—</span>}
          </div>}
          {!isMobile && <div style={{ font: "600 12.5px/1.2 var(--sans)", color: "#5C5853" }}>{active?.endDate ? fmt(active.endDate) : ""}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" }}>
            <span style={{ padding: "6px 11px", borderRadius: 999, background: est.bg, color: est.color, font: "700 12px/1 var(--sans)", whiteSpace: "nowrap" }}>{est.label}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A39C92" strokeWidth="2.2" strokeLinecap="round" style={{ transform: abierto ? "rotate(180deg)" : "none", transition: "transform 300ms var(--curva)", flexShrink: 0 }} aria-hidden><path d="m6 9 6 6 6-6" /></svg>
          </div>
        </div>

        {abierto && <div className="gt-aparece" style={{ borderTop: "1px solid rgba(44,42,40,.07)", padding: isMobile ? "14px 14px 16px" : "16px 18px 18px 74px", display: "flex", flexDirection: "column", gap: 16 }}>
          {active ? <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0,1fr))" : "repeat(5, minmax(0,1fr))", gap: 14 }}>
            {dato("Inicio", fmt(active.startDate))}
            {dato("Fin", active.endDate ? fmt(active.endDate) : "Indefinido")}
            {dato("Grupo", getGrupo(emp.company, active.contractType))}
            {!hideSalary && dato("Salario", fmtL(active.salary))}
            {dato("Días con contrato", acum.toLocaleString("es-HN"))}
          </div> : <div style={{ font: "500 13px/1.4 var(--sans)", color: "#6E6862" }}>No tiene un contrato activo registrado.</div>}
          {active?.notes && <div style={{ font: "400 12.5px/1.5 var(--sans)", color: "#6E6862" }}>{active.notes}</div>}
          {all.length > 0 && <div>
            <div className="gt-label" style={{ color: "#A39C92", fontSize: 9, marginBottom: 8 }}>Historial · {all.length}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {all.map(c => <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 12px", borderRadius: 12, background: c.status === "active" ? "rgba(62,142,90,.08)" : "rgba(44,42,40,.04)", font: "500 12.5px/1.3 var(--sans)", color: "#5C5853" }}>
                <b style={{ color: c.status === "active" ? "#3E8E5A" : c.status === "liquidated" ? ROJO : "#6E6862", minWidth: 74 }}>{estadoHist(c)}</b>
                <span>{fmt(c.startDate)} → {c.endDate ? fmt(c.endDate) : "indefinido"}</span>
                <span style={{ color: "#A39C92" }}>{tipoTxt(c.contractType)}</span>
                {!hideSalary && <span style={{ marginLeft: "auto", fontWeight: 700, color: "#5C5853" }}>{fmtL(c.salary)}</span>}
                {c.liquidationReason && <span style={{ width: "100%", color: "#6E6862" }}>{c.liquidationReason}</span>}
                {puedeEscribir && <span role="button" onClick={(ev) => { ev.stopPropagation(); setModal({ t: "cte", d: c }); }} style={{ marginLeft: hideSalary ? "auto" : 0, color: "#A39C92", font: "600 12px/1 var(--sans)", cursor: "pointer" }}>Editar</span>}
              </div>)}
            </div>
          </div>}
          {puedeEscribir && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!active && <button style={BTN("naranja")} onClick={() => setModal({ t: "ctn", presetEmpId: emp.id })}>Crear contrato</button>}
            {active && esTemp && <button style={BTN("naranja")} onClick={() => setModal({ t: "ctr", d: active })}>Renovar</button>}
            {active && esTemp && <button style={BTN("verde")} onClick={() => setModal({ t: "perm", d: active })}>Pasa a permanencia</button>}
          </div>}
        </div>}
      </div>;
    };

    const contadores = [
      ["vencidos", empleadosConContratos.filter(GRUPOS_F.vencidos.test).length, ROJO],
      ["pronto", empleadosConContratos.filter(GRUPOS_F.pronto.test).length, ORANGE_DARK],
      ["vigentes", empleadosConContratos.filter(GRUPOS_F.vigentes.test).length, "#3E8E5A"],
      ["sin", sinContrato.length, "#6E6862"],
    ];

    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0,1fr))" : "repeat(4, minmax(0,1fr))", gap: 12 }}>
        {contadores.map(([k, n, c], i) => {
          const on = ctFiltro === k;
          return <div key={k} role="button" tabIndex={0} aria-pressed={on} onClick={() => setCtFiltro(on ? "" : k)} onKeyDown={(ev) => { if (ev.key === "Enter") setCtFiltro(on ? "" : k); }} className="gt-vidrio gt-vidrio-hover gt-sube"
            style={{ padding: "14px 18px", cursor: "pointer", animationDelay: `${i * 40}ms`, boxShadow: on ? `inset 0 0 0 2px ${c}, 0 12px 30px rgba(44,42,40,.10)` : undefined }}>
            <div style={{ font: "800 28px/1 var(--display)", color: n ? c : "#C9C3BB" }}>{n}</div>
            <div style={{ font: "600 12.5px/1.2 var(--sans)", color: "#5C5853", marginTop: 7 }}>{GRUPOS_F[k].label}</div>
          </div>;
        })}
      </div>

      <div className="gt-vidrio" style={{ padding: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 260px", minWidth: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A39C92" strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, DNI o código"
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px 10px 38px", border: "1px solid rgba(44,42,40,.1)", borderRadius: 12, fontSize: 13, background: "rgba(255,255,255,.75)", color: CHARCOAL, outline: "none" }} />
        </div>
        {ctFiltro && <span role="button" onClick={() => setCtFiltro("")} style={{ padding: "8px 12px", borderRadius: 999, background: "rgba(44,42,40,.07)", font: "600 12.5px/1 var(--sans)", color: CHARCOAL, cursor: "pointer" }}>{GRUPOS_F[ctFiltro].label} ✕</span>}
        {filas.length > 1 && <span role="button" onClick={() => setCtAbiertos(todosAbiertos ? {} : Object.fromEntries(filas.map(x => [x.emp.id, true])))} style={{ padding: "8px 12px", borderRadius: 999, font: "600 12.5px/1 var(--sans)", color: "#5C5853", cursor: "pointer" }}>{todosAbiertos ? "Compactar todo" : "Expandir todo"}</span>}
        {puedeEscribir && <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          {sinContrato.length > 0 && <button style={BTN("ghost")} onClick={() => {
            if (!confirm(`Generar contratos automáticos para ${sinContrato.length} empleado(s) sin contrato? Se creará un contrato activo usando los datos actuales del empleado (fecha inicio, tipo, salario).`)) return;
            const nuevos = sinContrato.map(({ emp }) => ({
              id: uid(), employeeId: emp.id, company: emp.company, contractType: emp.contractType,
              startDate: emp.startDate || hoyISO(), endDate: emp.contractType === "temporary" ? (emp.endDate || "") : "",
              salary: Number(emp.salary) || 0, bonificacion: Number(emp.bonificacion) || 0, status: "active", parentContractId: null,
              notes: "Migración automática desde empleado existente", createdAt: new Date().toISOString(),
            }));
            sCt([...contracts, ...nuevos]);
            alert(`${nuevos.length} contrato(s) generados.`);
          }}>Generar faltantes ({sinContrato.length})</button>}
          <button className="gt-btn gt-btn-primario" onClick={() => setModal({ t: "ctn" })} style={{ minHeight: 38, padding: "9px 18px", fontSize: 13 }}>+ Nuevo contrato</button>
        </div>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filas.map(fila)}
      </div>
      {filas.length === 0 && <div className="gt-vidrio" style={{ padding: 34, textAlign: "center", color: "#6E6862", fontSize: 13.5 }}>
        {ctFiltro || q ? "Nadie coincide con ese filtro." : `Sin colaboradores en ${cc.name}.`}
      </div>}

      {/* Snapshot de mayo (setup inicial, idempotente): ya no ocupa una tarjeta
          entera — queda como enlace discreto al pie, solo admin/tesorería. */}
      {co === "subterra" && puedeEscribir && !isAnaRH && <div style={{ textAlign: "center", marginTop: 6 }}>
        <span role="button" onClick={applySubterraSnapshot}
          style={{ font: "500 12px/1 var(--sans)", color: "#A39C92", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>Snapshot inicial de Subterra · {SUBTERRA_SNAPSHOT_DATE}</span>
      </div>}
    </div>;
  };

  const renderContracts = () => ContractsView();

  // ── BONIFICACIONES ──
  const BonusForm = ({ bonus, presetEmpId }) => {
    const [f, setF] = useState(bonus || {
      employeeId: presetEmpId || "",
      description: "",
      amount: "",
      startDate: hoyISO(),
      hasEndDate: false,
      endDate: "",
    });
    const u = (k, v) => setF(p => ({ ...p, [k]: v }));
    const emp = ce.find(x => x.id === f.employeeId);
    return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <div style={{ gridColumn: "1/-1", background: "#FFFBF5", border: "1px solid #DBD4C8", borderRadius: 10, padding: 12, fontSize: 13, color: "#5C5853" }}>
        <strong>Política Geotecnica:</strong> los bonos son <b>mensuales</b>. Se paga <b>la mitad cada quincena</b> mientras esté activo. Si dejás vacía la fecha de fin, el bono es <b>indefinido</b> hasta que lo bajes.
      </div>
      <div style={{ gridColumn: "1/-1" }}>
        <BuscadorEmpleado label="Empleado" empleados={ce} value={f.employeeId} onChange={id => u("employeeId", id)} />
      </div>
      <div style={{ gridColumn: "1/-1" }}>
        <Input label="Descripción del bono" value={f.description} onChange={e => u("description", e.target.value)} placeholder="ej: Bono por productividad, Bono antigüedad, Bono mes de mayo..." />
      </div>
      <Input label="Monto mensual (L)" type="number" value={f.amount} onChange={e => u("amount", e.target.value)} placeholder="ej: 1500" />
      <Input label="Fecha de inicio" type="date" value={f.startDate} onChange={e => u("startDate", e.target.value)} />
      <div style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", background: "#F8F2E6", borderRadius: 10, border: "1px solid #DBD4C8" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#2C2A28" }}>
          <input type="checkbox" checked={f.hasEndDate} onChange={e => u("hasEndDate", e.target.checked)} style={{ width: 16, height: 16, accentColor: "#E8762D", cursor: "pointer" }} />
          Bono con fecha de fin (finito)
        </label>
        {f.hasEndDate ? (
          <Input label="Fecha de fin (último día que aplica)" type="date" value={f.endDate} onChange={e => u("endDate", e.target.value)} />
        ) : (
          <div style={{ fontSize: 12, color: "#8B847C", fontStyle: "italic" }}>
            Bono <b style={{ color: "#10B981" }}>indefinido</b> — se paga cada mes hasta que lo termines manualmente.
          </div>
        )}
      </div>
      {emp && f.amount && (
        <div style={{ gridColumn: "1/-1", background: "#ECFDF5", border: "1px solid #6EE7B7", borderRadius: 10, padding: 10, fontSize: 13, color: "#065F46" }}>
          Resumen: <b>{emp.fullName}</b> recibirá <b>{fmtL(Number(f.amount))}</b>/mes ({fmtL(Number(f.amount) / 2)} por quincena) {f.hasEndDate && f.endDate ? <>desde <b>{fmt(f.startDate)}</b> hasta <b>{fmt(f.endDate)}</b></> : <>desde <b>{fmt(f.startDate)}</b> · <b>indefinido</b></>}.
        </div>
      )}
      <div style={{ gridColumn: "1/-1", display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
        <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
        <Btn variant="success" onClick={() => {
          if (!f.employeeId || !f.description || !f.amount || !f.startDate) return alert("Complete empleado, descripción, monto y fecha de inicio");
          if (f.hasEndDate && !f.endDate) return alert("Indique la fecha de fin del bono o desmarque la opción");
          if (f.hasEndDate && f.endDate < f.startDate) return alert("La fecha de fin debe ser posterior a la fecha de inicio");
          const newB = {
            id: bonus?.id || uid(),
            employeeId: f.employeeId,
            description: f.description,
            amount: Number(f.amount),
            startDate: f.startDate,
            endDate: f.hasEndDate ? f.endDate : null,
            status: "active",
            createdAt: bonus?.createdAt || new Date().toISOString(),
          };
          if (bonus) sBn(bonifs.map(x => x.id === bonus.id ? newB : x));
          else sBn([...bonifs, newB]);
          setModal(null);
        }}>{bonus ? "Guardar" : "Crear bono"}</Btn>
      </div>
    </div>;
  };

  const renderBonuses = () => {
    const today = hoyISO();
    const activos = cbn.filter(b => b.status === "active");
    const indefinidos = activos.filter(b => !b.endDate);
    const finitos = activos.filter(b => b.endDate);
    const venceEn30 = finitos.filter(b => b.endDate && daysUntil(b.endDate) !== null && daysUntil(b.endDate) <= 30 && daysUntil(b.endDate) >= 0);
    const terminados = cbn.filter(b => b.status === "ended");

    // Agrupar por empleado
    const porEmp = {};
    cbn.forEach(b => {
      if (!porEmp[b.employeeId]) porEmp[b.employeeId] = [];
      porEmp[b.employeeId].push(b);
    });

    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <span style={{ color: "#5C5853", fontSize: 13 }}>
          {activos.length} bonos activos · {indefinidos.length} indefinidos · {finitos.length} finitos · {terminados.length} terminados
        </span>
        <Btn onClick={() => setModal({ t: "bnn" })}>+ Nueva bonificación</Btn>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <AlertCard color="#10B981" icon="♾️" label="Bonos indefinidos" value={indefinidos.length} />
        <AlertCard color="#F59E0B" icon="⏳" label="Vencen este mes" value={venceEn30.length} />
        <AlertCard color="#7C3AED" icon="📅" label="Bonos finitos activos" value={finitos.length} />
        <AlertCard color="#94A3B8" icon="📦" label="Terminados (histórico)" value={terminados.length} />
      </div>

      <div style={{ background: "#FFFBF5", border: "1px solid #DBD4C8", borderRadius: 10, padding: "12px 16px", fontSize: 12.5, color: "#5C5853" }}>
        <strong>💡 Cómo funciona:</strong> los bonos extra que agregues acá <b>se suman</b> a la bonificación base que cada empleado tiene en su ficha. La planilla los integra automáticamente — la mitad en 1Q y la otra mitad en 2Q. Los bonos viejos (que ya están en la ficha de cada empleado) siguen funcionando igual; este módulo es para agregar <b>bonos nuevos</b>.
      </div>

      {Object.keys(porEmp).length === 0 && (
        <div style={{ background: "#fff", border: "1px dashed #DBD4C8", borderRadius: 12, padding: 32, textAlign: "center", color: "#8B847C" }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🎁</div>
          <div style={{ fontWeight: 600, color: "#2C2A28", marginBottom: 6 }}>Sin bonos extra registrados</div>
          <div style={{ fontSize: 13 }}>Las bonificaciones base ya configuradas en cada empleado siguen funcionando. Acá agregás bonos nuevos.</div>
        </div>
      )}

      {Object.entries(porEmp)
        .sort(([a], [b]) => (en(a) || "").localeCompare(en(b) || ""))
        .map(([empId, lista]) => {
          const emp = ce.find(x => x.id === empId);
          if (!emp) return null;
          const code = genEmpCode(emp.fullName, emp.dni);
          const baseEmp = Number(emp.bonificacion) || 0;
          const extraActivo = lista.filter(b => b.status === "active").reduce((s, b) => s + (Number(b.amount) || 0), 0);
          const totalMensual = baseEmp + extraActivo;
          return (
            <div key={empId} style={{ background: "#fff", border: "1px solid #DBD4C8", borderRadius: 12, padding: "14px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#2C2A28" }}>
                    {emp.fullName} <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 10, fontWeight: 700, color: "#E8762D", marginLeft: 6 }}>{code}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#8B847C", marginTop: 2 }}>
                    Bono base ficha: <b>{fmtL(baseEmp)}</b>/mes · Bonos extra: <b>{fmtL(extraActivo)}</b>/mes ·
                    <span style={{ color: "#E8762D", fontWeight: 700 }}> Total: {fmtL(totalMensual)}/mes</span> ({fmtL(totalMensual / 2)}/quincena)
                  </div>
                </div>
                <Btn small onClick={() => setModal({ t: "bnn", presetEmpId: empId })}>+ Agregar bono</Btn>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {lista
                  .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""))
                  .map(b => {
                    const isActive = b.status === "active";
                    const diasParaFin = b.endDate ? daysUntil(b.endDate) : null;
                    const finVencido = diasParaFin !== null && diasParaFin < 0;
                    return (
                      <div key={b.id} style={{ background: isActive ? (finVencido ? "#FEF3C7" : "#F8F2E6") : "#F1F5F9", borderLeft: `3px solid ${!isActive ? "#94A3B8" : finVencido ? "#F59E0B" : b.endDate ? "#7C3AED" : "#10B981"}`, borderRadius: 8, padding: "10px 14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, color: "#2C2A28", fontSize: 13 }}>{b.description}</div>
                            <div style={{ fontSize: 11, color: "#5C5853", marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                              <span><strong>{fmtL(b.amount)}</strong>/mes ({fmtL(b.amount / 2)}/quincena)</span>
                              <span><strong>Inicio:</strong> {fmt(b.startDate)}</span>
                              {b.endDate ? (
                                <span><strong>Fin:</strong> {fmt(b.endDate)}</span>
                              ) : (
                                <Badge color="#10B981">♾️ Indefinido</Badge>
                              )}
                              {!isActive && <Badge color="#94A3B8">Terminado {b.endedDate ? fmt(b.endedDate) : ""}</Badge>}
                              {isActive && b.endDate && diasParaFin !== null && (
                                <Badge color={diasParaFin < 0 ? "#DC2626" : diasParaFin <= 7 ? "#DC2626" : diasParaFin <= 30 ? "#F59E0B" : "#10B981"}>
                                  {diasParaFin < 0 ? `Venció hace ${-diasParaFin}d` : diasParaFin === 0 ? "Vence hoy" : `Vence en ${diasParaFin}d`}
                                </Badge>
                              )}
                            </div>
                          </div>
                          {isActive && (
                            <div style={{ display: "flex", gap: 4 }}>
                              <Btn small variant="ghost" onClick={() => setModal({ t: "bne", d: b })}>Editar</Btn>
                              <Btn small variant="danger" onClick={() => {
                                const reason = prompt(`Terminar bono "${b.description}"?\nMotivo (opcional):`, "");
                                if (reason === null) return;
                                sBn(bonifs.map(x => x.id === b.id ? { ...x, status: "ended", endedDate: today, endedReason: reason } : x));
                              }}>Terminar</Btn>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          );
        })}
    </div>;
  };

  // ── ACCESOS (2-oct-2026) ──
  // Lectura SOLO con getCloud al entrar a la pestaña (nunca store.get: un
  // cache viejo podría revivir un acceso desactivado). Guardado: getCloud →
  // merge por id → set → verify releyendo la nube.
  const guardarAcceso = async (rec) => {
    try {
      const c = await store.getCloud("gt-usuarios");
      const base = Array.isArray(c) ? c : [];
      if (base.some(x => x.id !== rec.id && x.username === rec.username) || USERS.some(x => x.username === rec.username)) { alert("Ese usuario ya existe en la nube. Elegí otro."); return false; }
      const next = base.some(x => x.id === rec.id) ? base.map(x => x.id === rec.id ? rec : x) : [...base, rec];
      const ok = await store.set("gt-usuarios", next);
      if (!ok) { alert("No se pudo guardar en la nube. Reintentá."); return false; }
      const back = await store.getCloud("gt-usuarios");
      const fila = Array.isArray(back) ? back.find(x => x.id === rec.id) : null;
      if (!fila || fila.updatedAt !== rec.updatedAt) { alert("VERIFICACIÓN FALLÓ: la nube no refleja el acceso."); return false; }
      setAccesos(back);
      return true;
    } catch (e) { alert("Sin conexión con la nube: no se guardó el acceso."); console.warn("[Accesos]", e); return false; }
  };
  const renderAccesos = () => {
    const lista = accesos || [];
    const tomados = [...USERS.map(x => x.username), ...USUARIOS_DE_BAJA, ...lista.map(x => x.username)];
    const proyectosOrd = [...hrProjects].sort((a, b) => String(a.short).localeCompare(String(b.short), "es", { sensitivity: "base", numeric: true }));
    const chipRol = (r) => <span style={{ display: "inline-flex", padding: "4px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, color: r === "residente" ? "#A94E16" : "#6E6862", background: r === "residente" ? "rgba(232,118,45,.14)" : "rgba(44,42,40,.06)", whiteSpace: "nowrap" }}>{ROLE_LABEL[r] || r}</span>;
    const fila = (x, fijo) => <div key={x.id || x.username} className={fijo ? "gt-vidrio" : "gt-vidrio gt-vidrio-hover"} onClick={fijo ? undefined : () => setModal({ t: "acceso", d: x })} style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", cursor: fijo ? "default" : "pointer", opacity: x.activo === false ? .6 : 1 }}>
      <div style={{ minWidth: 200 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: CHARCOAL }}>{x.label}</div>
        <div style={{ fontSize: 11.5, color: "#6E6862", fontFamily: "var(--mono, monospace)" }}>{x.username}</div>
      </div>
      {chipRol(x.role)}
      <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
        {x.activo === false && <span style={{ padding: "4px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, color: "#B03024", background: "rgba(192,57,43,.07)" }}>Desactivado</span>}
        {fijo ? <span style={{ fontSize: 11, color: "#A39C92" }}>fijo del sistema</span> : <span style={{ fontSize: 11.5, color: "#6E6862" }}>Editar →</span>}
      </div>
    </div>;
    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <style>{GT_CSS}</style>
      <div className="gt-vidrio" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ font: "800 22px/1 var(--display, inherit)", color: CHARCOAL }}>{lista.filter(x => x.activo !== false).length}</div>
          <div className="gt-label" style={{ color: "#6E6862", marginTop: 5, fontSize: 9 }}>accesos creados</div>
        </div>
        <div style={{ borderLeft: "1px solid rgba(44,42,40,.08)", paddingLeft: 14 }}>
          <div style={{ font: "800 22px/1 var(--display, inherit)", color: CHARCOAL }}>{lista.filter(x => x.role === "residente" && x.activo !== false).length}</div>
          <div className="gt-label" style={{ color: "#6E6862", marginTop: 5, fontSize: 9 }}>residentes</div>
        </div>
        <div style={{ marginLeft: "auto" }}><Btn onClick={() => setModal({ t: "acceso", d: null })} disabled={accesos === null}>+ Dar acceso a un colaborador</Btn></div>
      </div>
      {accesosErr && <div style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(192,57,43,.07)", color: "#B03024", fontSize: 13 }}>{accesosErr}</div>}
      {accesos === null && !accesosErr && <div className="gt-vidrio" style={{ padding: "30px 20px", textAlign: "center", color: "#6E6862", fontSize: 13 }}>Leyendo accesos…</div>}
      {accesos !== null && <>
        <div className="gt-label" style={{ color: "#6E6862", marginTop: 6 }}>Creados desde GeoTeam</div>
        {lista.length === 0
          ? <div className="gt-vidrio" style={{ padding: "34px 20px", textAlign: "center", color: "#6E6862", fontSize: 13.5 }}>Todavía no hay accesos creados. Los residentes de GeoSupply se crean acá, desde la ficha del colaborador.</div>
          : [...lista].sort((a, b) => String(a.label).localeCompare(String(b.label), "es", { sensitivity: "base" })).map(x => fila(x, false))}
        <div className="gt-label" style={{ color: "#6E6862", marginTop: 10 }}>Fijos del sistema</div>
        {USERS.filter(x => x.role !== "marcaje").map(x => fila(x, true))}
      </>}
    </div>;
  };

  const renderSec = () => {
    // Guardia por rol: el switch cae a Dashboard por default, así que sin
    // esto un rol acotado podría ver planilla/costos si `sec` queda en un id
    // que no está en su nav (o si el default lo manda al Dashboard).
    const permitidas = nav.map(n => n.id);
    if (!permitidas.includes(sec) && nav.length < allNav.length) return renderSec2(permitidas[0]);
    return renderSec2(sec);
  };
  const renderSec2 = (s) => { switch (s) { case "employees": return renderEmps(); case "contracts": return renderContracts(); case "bonuses": return renderBonuses(); case "payroll": return renderPayroll(); case "vacations": return renderVacs(); case "leaves": return renderLvs(); case "attendance": return renderAtts(); case "tardanzas": return renderTardanzas(); case "kpis": return renderKpis(); case "movimientos": return renderMovs(); case "constancias": return renderCons(); case "costos": return renderCostosMO(); case "horasextras": return renderHE(); case "accesos": return renderAccesos(); case "solicitudes": return renderSolicitudesHub(); case "mi": return renderMiRRHH(); case "asistencia": return renderAsistenciaHub(); default: return renderDashboard(); } };

  const renderModal = () => { if (!modal) return null; const m = modal; switch (m.t) {
    case "en": return <Modal title="Nuevo empleado" onClose={() => setModal(null)} wide><EmpForm onSave={e => sE([...emps, e])} /></Modal>;
    case "acceso": return <Modal title={m.d ? `Acceso de ${m.d.label}` : "Dar acceso al sistema"} onClose={() => setModal(null)}><AccesoFormImpl acceso={m.d} emps={emps} proyectos={[...hrProjects].sort((a, b) => String(a.short).localeCompare(String(b.short), "es", { sensitivity: "base", numeric: true }))} tomados={[...USERS.map(x => x.username), ...USUARIOS_DE_BAJA, ...(accesos || []).map(x => x.username)]} userName={userName} onSave={guardarAcceso} onClose={() => setModal(null)} /></Modal>;
    case "ee": return <Modal title="Editar empleado" onClose={() => setModal(null)} wide><EmpForm emp={m.d} onSave={e => sE(emps.map(x => x.id === e.id ? e : x))} /></Modal>;
    {/* Vacaciones y permisos marcan SOLOS la asistencia (syncVacacion /
        syncPermiso) — al editar se limpia el rango viejo antes de aplicar. */}
    case "vn": return <Modal title="Vacaciones" onClose={() => setModal(null)}><VacForm onSave={async v => { await sV([...vacs, v]); await syncVacacion(v, null); }} /></Modal>;
    case "ve": return <Modal title="Editar vacaciones" onClose={() => setModal(null)}><VacForm vac={m.d} onSave={async v => { const viejo = vacs.find(x => x.id === v.id) || null; await sV(vacs.map(x => x.id === v.id ? v : x)); await syncVacacion(v, viejo); }} /></Modal>;
    case "ln": return <Modal title="Permiso" onClose={() => setModal(null)}><LvForm onSave={async l => { await sL([...lvs, l]); await syncPermiso(l, null); }} /></Modal>;
    case "le": return <Modal title="Editar permiso" onClose={() => setModal(null)}><LvForm lv={m.d} onSave={async l => { const viejo = lvs.find(x => x.id === l.id) || null; await sL(lvs.map(x => x.id === l.id ? l : x)); await syncPermiso(l, viejo); }} /></Modal>;
    case "cuad": return <Modal title={`Distribucion de cuadrilla — ${cc.name}`} onClose={() => setModal(null)} wide><CuadrillaForm /></Modal>;
    case "cuad-edit": return <Modal title={`Editar cuadrilla ${m.d.quincena} ${m.d.periodo} — ${cc.name}`} onClose={() => setModal(null)} wide><CuadrillaForm cuad={m.d} /></Modal>;
    case "ag": return <Modal title={`Asistencia ${m.d.quincena} ${m.d.periodo}`} onClose={() => {
      // Mismo contrato que el boton Cerrar: confirmar si hay cambios sin
      // guardar y descartar el respaldo anti-remount.
      if (attDraftRef.current?.dirty && !confirm("Tenés cambios SIN GUARDAR en la asistencia.\n\n¿Cerrar sin guardar?")) return;
      attDraftRef.current = null;
      setModal(null);
    }} wide><AttendanceGrid sheet={m.d} /></Modal>;
    case "he": return <Modal title={`Horas Extras ${m.d.quincena} ${m.d.periodo}`} onClose={() => {
      // Mismo contrato que el boton Cerrar: confirmar si hay cambios sin
      // guardar y descartar el respaldo (el draft solo protege remounts
      // MIENTRAS la hoja esta abierta — nunca sobrevive al cierre).
      if (heDraftRef.current?.dirty && !confirm("Tenés cambios SIN GUARDAR en la hoja de horas extras.\n\n¿Cerrar sin guardar?")) return;
      heDraftRef.current = null;
      setModal(null);
    }} wide><HorasExtrasGrid sheet={m.d} /></Modal>;
    case "he-new": return <Modal title="Nueva hoja de horas extras" onClose={() => setModal(null)}><HeNewForm /></Modal>;
    case "mn": return <Modal title="Registrar ALTA de empleado" onClose={() => setModal(null)} wide><AltaForm /></Modal>;
    case "mb": return <Modal title="Registrar BAJA de empleado" onClose={() => setModal(null)} wide><BajaForm /></Modal>;
    case "me": return <Modal title={`Editar movimiento — ${m.d.fullName}`} onClose={() => setModal(null)} wide><EditMovForm mov={m.d} onSave={updated => sM(movs.map(x => x.id === updated.id ? updated : x))} /></Modal>;
    // 26-oct-2026: el "+ Generar" arma la constancia CALCADA del Word (la misma
    // del hub de RRHH) con vista previa y PDF; el ConForm viejo de texto quedó sin uso.
    case "cn": return <Modal title="Generar constancia" onClose={() => setModal(null)} wide><GenerarConstanciaImpl emps={emps} puedeTrabajo={!hideSalary} onGuardar={(reg) => anexarEn("hr-cons", [{ ...reg, emitidaPor: userName }], setCons)} onClose={() => setModal(null)} /></Modal>;
    case "ctn": return <Modal title="Nuevo contrato" onClose={() => setModal(null)} wide><ContractForm presetEmpId={m.presetEmpId} onSave={() => {}} /></Modal>;
    case "cte": return <Modal title="Editar contrato" onClose={() => setModal(null)} wide><ContractForm contract={m.d} onSave={() => {}} /></Modal>;
    case "ctr": return <Modal title="Renovar contrato" onClose={() => setModal(null)} wide><ContractForm parent={m.d} onSave={() => {}} /></Modal>;
    case "perm": return <Modal title="⭐ Pasa a permanencia" onClose={() => setModal(null)} wide><PermanenciaForm contract={m.d} /></Modal>;
    case "bnn": return <Modal title="Nueva bonificación" onClose={() => setModal(null)} wide><BonusForm presetEmpId={m.presetEmpId} /></Modal>;
    case "bne": return <Modal title="Editar bonificación" onClose={() => setModal(null)} wide><BonusForm bonus={m.d} /></Modal>;
    default: return null;
  }};

  const roleLabel = userRole === "admin" ? "Recursos Humanos" : userRole === "tesoreria" ? "Tesorería — acceso completo" : userRole === "asistente" ? "Asistente RRHH" : userRole === "gerencia" ? "Gerencia (solo lectura)" : userRole === "costos" ? "Costos (solo lectura)" : userRole === "recepcion" ? "Fotos del personal" : userRole === "asistente_compras" ? "Personal y asistencia" : userRole === "logistica" ? "Aprobador de llegadas tardías (plantel/almacén)" : esPortalSolo ? "Mi RRHH" : (userRole || "Usuario");
  const logoUrl = `${import.meta.env.BASE_URL}brand/logo-color.png`;

  // ── Encabezado y pestañas (15-oct-2026): mismo estilo que GeoInventory /
  // GeoSupply. Se retiró el hero con la ilustración, el título repetido de la
  // pestaña ("Dashboard / Subterra Honduras") y los emojis de las pestañas.
  // Dashboard, KPI's y Empleados NO llevan el <fieldset disabled>: solo
  // muestran (los botones que escriben ya se ocultan por rol) y así un rol de
  // solo lectura puede buscar y filtrar.
  const SIN_CANDADO = ["dashboard", "kpis", "employees", "contracts", "solicitudes", "mi"];
  const secVista = nav.some(n => n.id === sec) ? sec : nav[0]?.id;
  const candado = isReadOnly && !SIN_CANDADO.includes(secVista);
  return <div className="gt-entra-modulo" style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "var(--sans)", background: "var(--bg)", color: CHARCOAL, position: "relative", overflow: "hidden" }}>
    <style>{GT_CSS}</style>
    <div className="gt-brillo gt-brillo-a" aria-hidden />
    <div className="gt-brillo gt-brillo-b" aria-hidden />
    <div style={{ position: "relative", zIndex: 2, flexShrink: 0, borderBottom: "1px solid rgba(44,42,40,.08)", padding: isMobile ? "10px 12px" : "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: isMobile ? "wrap" : "nowrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12, minWidth: 0 }}>
        {onBack && <button className="gt-circulo" onClick={onBack} title="Volver al panel" aria-label="Volver al panel" style={{ width: 40, height: 40, fontSize: 17 }}>←</button>}
        <img src={logoUrl} alt="Geotecnica Soluciones" style={{ height: isMobile ? 28 : 34, width: "auto", display: "block" }} />
        <div title="GeoTeam" style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(232,118,45,.12)", color: "var(--naranja-tinta)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><circle cx="17" cy="9" r="2.4" /><path d="M16 14.2c2.4-.2 4.1 1.3 4.6 4" /></svg>
        </div>
        {!isMobile && <div style={{ font: "800 15px/1 var(--display)", color: CHARCOAL }}>GeoTeam</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0, order: isMobile ? 3 : 0, width: isMobile ? "100%" : "auto", justifyContent: isMobile ? "center" : "flex-start" }}>
        {!esPortalSolo && pista(Object.entries(COMPANIES).map(([k, v]) => ({ k, label: isMobile ? v.name.split(" ")[0] : v.name, on: co === k, onClick: () => setCo(k) })))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        {!isMobile && <div style={{ textAlign: "right" }}>
          <div style={{ font: "600 13px/1.3 var(--sans)", color: CHARCOAL }}>{userName || "Usuario"}</div>
          <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 2 }}>{isReadOnly ? "Solo lectura" : roleLabel}</div>
        </div>}
        {onLogout && <button onClick={onLogout} title="Cerrar sesión" style={{ minHeight: 36, padding: "8px 14px", borderRadius: 999, border: "1px solid rgba(192,57,43,.25)", background: "rgba(192,57,43,.06)", color: "#B03024", font: "700 12px/1 var(--sans)", cursor: "pointer" }}>{isMobile ? "Salir" : "Cerrar sesión"}</button>}
      </div>
    </div>
    {nav.length > 1 && <div style={{ position: "relative", zIndex: 2, display: "flex", borderBottom: "1px solid rgba(44,42,40,.08)", overflowX: "auto", whiteSpace: "nowrap", flexShrink: 0, paddingLeft: isMobile ? 4 : 20, scrollbarWidth: "none" }}>
      {nav.map(n => { const active = secVista === n.id; return <button key={n.id} onClick={() => setSec(n.id)} style={{ padding: isMobile ? "12px 13px" : "14px 16px", background: "transparent", border: "none", boxShadow: active ? `inset 0 -2px 0 ${ORANGE}` : "none", color: active ? "var(--naranja-tinta)" : "var(--text-3)", font: `${active ? 800 : 600} 13px/1 var(--sans)`, cursor: "pointer", whiteSpace: "nowrap" }}>{n.label}{n.badge > 0 && <span style={{ marginLeft: 6, display: "inline-block", minWidth: 18, padding: "2px 5px", borderRadius: 999, background: ORANGE, color: "#fff", font: "800 10.5px/1.2 var(--sans)", textAlign: "center", verticalAlign: "middle" }}>{n.badge}</span>}</button>; })}
    </div>}
    <div style={{ position: "relative", zIndex: 1, flex: 1, overflow: "auto" }}>
      <div style={{ padding: isMobile ? "12px 12px 24px" : "18px 32px 32px", maxWidth: 1500, margin: "0 auto", boxSizing: "border-box" }}>
        {candado && <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 14px", borderRadius: 999, background: "rgba(44,42,40,.06)", color: "#5C5853", font: "600 12px/1 var(--sans)", marginBottom: 14 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#A39C92" }} />Solo lectura: podés ver todo, sin editar
        </div>}
        <fieldset disabled={candado} style={{ border: "none", padding: 0, margin: 0, minWidth: 0 }}>
          {renderSec()}
        </fieldset>
      </div>
    </div>
    {!isReadOnly && renderModal()}
    {renderModalHub()}
    {renderCarnet()}
  </div>;
}
