// =====================================================================
// LISTA CANONICA DE PROYECTOS — GRUPO GEOTECNICA
// =====================================================================
// Fuente unica de verdad para los 3 modulos: RRHH, Compras, Operations CC.
// Cada proyecto tiene un codigo contable y aliases para retrocompatibilidad
// con datos ya guardados en Supabase (cuadrillas, asistencia, planillas).
// =====================================================================

export const PROJECTS = [
  {
    id: "p-ebenezer",
    short: "EBENEZER",
    name: "Ebenezer",
    client: "Constructora Ebenezer",
    code: "Por asignar",
    icon: "🏗️",
    company: "geotecnica",
    aliases: ["EBENEZER"],
  },
  {
    id: "p-amicci",
    short: "AMICCI",
    name: "Amicci",
    client: "Amicci",
    code: "Por asignar",
    icon: "🌊",
    company: "geotecnica",
    aliases: [],
  },
  {
    id: "p-aurea",
    short: "AUREA",
    name: "Aurea - Galeas",
    client: "Aurea - Galeas",
    code: "Por asignar",
    icon: "👀",
    company: "geotecnica",
    aliases: [],
  },
  {
    id: "p-ccmicros",
    short: "CC-MICROS",
    name: "CC El Camino · Micropilotes",
    client: "Desarrollos El Camino",
    code: "Por asignar",
    icon: "🛣️",
    company: "geotecnica",
    aliases: [],
  },
  {
    id: "p-ccanclajes",
    short: "CC-ANCLAJES",
    name: "CC El Camino · Anclajes",
    client: "Desarrollos El Camino",
    code: "Por asignar",
    icon: "⚓",
    company: "geotecnica",
    aliases: [],
  },
  {
    id: "p-villaroy",
    short: "VILLAROY",
    name: "Museo Villaroy",
    client: "Villaroy",
    code: "Por asignar",
    icon: "🏘️",
    company: "geotecnica",
    aliases: ["VILLA ROY"],
  },
  {
    id: "p-icon",
    short: "ICON",
    name: "Torre Icon",
    client: "Grupo Icon",
    code: "HR-30-2025",
    icon: "🏢",
    company: "geotecnica",
    aliases: [],
  },
  {
    id: "p-fallakm57",
    short: "KM-57",
    name: "Falla KM-57 Copán",
    client: "Por definir",
    code: "Por asignar",
    icon: "⛰️",
    company: "geotecnica",
    aliases: [],
  },
  {
    id: "p-miramesi",
    short: "MIRAMESI",
    name: "Miramesi",
    client: "Miramesi",
    code: "HR-20-1-18-2025",
    icon: "🔧",
    company: "geotecnica",
    aliases: ["MIRAMESI"],
  },
  {
    id: "p-apolo",
    short: "APOLO",
    name: "Cimentacion Apolo",
    client: "—",
    code: "HF-12-4-17-2025",
    icon: "🚀",
    company: "geotecnica",
    aliases: ["APOLO"],
  },
  {
    id: "p-plantel",
    short: "PLANTEL-OFICINA",
    name: "Plantel y Oficina",
    client: "Interno",
    code: "INT-001",
    icon: "🏛️",
    company: "geotecnica",
    aliases: ["PLAN-TALLER", "OFICINA", "PLANTEL", "TALLER"],
  },
];

// ── HELPERS ──

// Buscar proyecto por short, id, o cualquier alias previo.
export function findProject(shortOrId) {
  if (!shortOrId) return null;
  const k = String(shortOrId).trim();
  return (
    PROJECTS.find((p) => p.short === k) ||
    PROJECTS.find((p) => p.id === k) ||
    PROJECTS.find((p) => (p.aliases || []).includes(k)) ||
    null
  );
}

// Recibe un short viejo (puede ser un alias) y devuelve el short canonico.
// Si no existe en la lista, devuelve el original (por si el usuario tiene
// un proyecto custom).
export function resolveShort(short) {
  const p = findProject(short);
  return p ? p.short : short;
}

// Devuelve el nombre amigable o el short si no se encuentra.
export function projectName(short) {
  const p = findProject(short);
  return p ? p.name : short;
}

// Devuelve el codigo contable o "—" si no se encuentra.
export function projectCode(short) {
  const p = findProject(short);
  return p ? p.code : "—";
}

// Lista de shorts canonicos (para selectors, sin aliases).
export const PROJECT_SHORTS = PROJECTS.map((p) => p.short);

// Lista para selectors con label completo "SHORT — Name".
export const PROJECT_OPTIONS = PROJECTS.map((p) => ({
  value: p.short,
  label: `${p.short} — ${p.name}`,
}));
