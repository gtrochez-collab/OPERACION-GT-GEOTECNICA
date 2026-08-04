// =====================================================================
// USUARIOS DEL SISTEMA — Grupo Geotecnica
// =====================================================================
// Lista compartida entre App.jsx (login) y ChatModule.jsx (DMs).
// Cualquier usuario nuevo se agrega aqui — ambos modulos lo recogen
// automaticamente.
// =====================================================================

export const USERS = [
  { username: "administrador", password: "1234geo",        role: "admin",              label: "Lic. Gerson Trochez" },
  { username: "daniel",        password: "daniel1234",     role: "admin",              label: "Daniel Flores" },
  { username: "asistente",     password: "asistente1234",  role: "asistente",          label: "Asistente" },
  { username: "carolina",      password: "carolina1234",   role: "tesoreria",          label: "Lic. Carolina Flores-Hernandez" },
  { username: "gerencia",      password: "gerencia1234",   role: "gerencia",           label: "Gerencia" },
  { username: "gerson",        password: "gerson1234",     role: "coordinador",        label: "Lic. Gerson Trochez" },
  { username: "christian",     password: "christian1234",  role: "costos",             label: "Lic. Christian Gallo" },
  { username: "oscarpaz",      password: "oscarpaz1234",   role: "logistica",          label: "Oscar Paz" },
  { username: "jorge",         password: "jorge1234",      role: "recepcion",          label: "Jorge Castellanos" },
  { username: "ana",           password: "ana1234",        role: "asistente_compras",  label: "Ana Vasquez" },
  { username: "fernando",      password: "fernando1234",   role: "coordinador_maquinas", label: "Lic. Fernando Diaz" },
  { username: "almacen",       password: "almacen1234",    role: "almacenista",          label: "Encargado de Almacen" },
  { username: "jose",          password: "jose1234",       role: "almacen_visor",        label: "Jose (Asistente Almacen)" },
  // Arturo: pidio (ago 2026) los MISMOS permisos que Christian en GeoShopping
  // — crear solicitudes, validar, proyectos, proveedores, fichas. Se le dio un
  // rol propio en vez de "costos" para NO abrirle GeoTeam (planilla/salarios).
  // En GeoMachinery sigue siendo solo lectura, como antes.
  { username: "arturo",        password: "arturo1234",     role: "compras_ops",          label: "Arturo Trochez" },
];

export const ROLE_LABEL = {
  admin:              "Administrador",
  asistente:          "Asistente",
  tesoreria:          "Tesoreria",
  gerencia:           "Gerencia (solo lectura)",
  coordinador:        "Coordinador de Operaciones",
  costos:             "Costos / Operaciones",
  logistica:          "Logistica / Flota",
  recepcion:          "Recepcion / Logistica",
  asistente_compras:  "Asistente de Compras / Coordinacion",
  coordinador_maquinas: "Coordinador de Maquinas",
  almacenista:        "Encargado de Almacen (GeoDrill Vault)",
  almacen_visor:      "Visor de Almacen (solo lectura)",
  visor_compras:      "Visor de Compras (solo lectura)",
  compras_ops:        "Compras / Operaciones",
};

// Color para el avatar de cada usuario (rotativo segun el username)
export const userColor = (username) => {
  const palette = ["#0F4C75", "#8B3A3A", "#1B4332", "#7C3AED", "#E8762D", "#0891B2", "#BE185D", "#D97706"];
  if (!username) return "#64748b";
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = (hash * 31 + username.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
};

// Iniciales para el avatar
export const userInitials = (label) => {
  if (!label) return "?";
  // Quita prefijos como "Lic." antes de tomar las iniciales
  const clean = label.replace(/^(Lic\.|Ing\.|Sr\.|Sra\.|Dr\.)\s+/i, "").trim();
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length > 2 ? 2 : 1][0]).toUpperCase();
};
