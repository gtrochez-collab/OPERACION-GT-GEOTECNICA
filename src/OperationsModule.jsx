import { useState, useEffect, useRef, useMemo } from "react";
import { store } from "./supabase.js";
import Logo from "./Logo.jsx";

const STORE_KEY = "gt-operations-state";

// ============ PALETA / ESTILOS ============
// Tema oscuro calido alineado con la marca Geotecnica.
const C = {
  bg: "#1F1B17",            // dark warm (era slate)
  card: "#2A2520",          // dark surface
  cardHover: "#352F28",
  border: "#3D3530",
  borderSoft: "#332D27",
  textHi: "#F0EBE3",        // texto principal calido
  text: "#E0D8CC",
  textMid: "#C4BBAA",
  textLo: "#A8A096",
  textDim: "#7A7268",
  accent: "#E8762D",        // naranja Geotecnica (era #D97706)
  accentDark: "#C75F1F",
  accentLight: "#F18A3F",
  accentBg: "rgba(232,118,45,0.15)",
  accentBgHover: "rgba(232,118,45,0.25)",
  red: "#DC2626",
  redLight: "#F87171",
  yellow: "#F59E0B",
  yellowLight: "#FBBF24",
  green: "#10B981",
  greenLight: "#34D399",
  purple: "#8B5CF6",
  purpleLight: "#A78BFA",
  blue: "#3B82F6",
  blueLight: "#60A5FA",
};

// ============ DATOS SEMILLA ============
const SEED = {
  proyectos: [
    {
      id: "p-ebenezer",
      usaAmarres: true,
      nombre: "Ebenezer",
      icono: "🏗️",
      cliente: "Constructora Ebenezer",
      pm: "Dr. Edy Montalván",
      estado: "En ejecución",
      estadoClass: "ejecucion",
      semaforo: "red",
      hitoProximo: "Llegada polímero a Palmerola",
      objetivo: "",
      requerimientos: [
        { desc: "Polímero + bomba Huskey (Panamá → Honduras)", tipo: "import", necesaria: "ASAP", eta: "Por confirmar", status: "transito", responsable: "Yo / Compras", critico: true, notas: "Apenas den el visto bueno → traerlo a Palmerola y que se vaya a Ebenezer" },
        { desc: "Contenedor (cotizar y sellar)", tipo: "local", necesaria: "Esta semana", eta: "—", status: "cotizacion", responsable: "Yo / Compras", critico: false, notas: "1 contenedor — cotizar y sellar" },
        { desc: "Gabeteros", tipo: "local", necesaria: "Esta semana", eta: "—", status: "pendiente", responsable: "Yo", critico: false, notas: "Conseguir" },
        { desc: "6 camas matrimoniales (compra)", tipo: "local", necesaria: "Esta semana", eta: "—", status: "pendiente", responsable: "Yo", critico: false, notas: "Compra" },
        { desc: "5 camas unipersonales (devolución)", tipo: "local", necesaria: "Esta semana", eta: "—", status: "pendiente", responsable: "Yo", critico: false, notas: "Devolver" },
        { desc: "Refri (mandar desde Tegus → SPS)", tipo: "local", necesaria: "Esta semana", eta: "—", status: "pendiente", responsable: "Yo / Logística", critico: false, notas: "Movilizar" },
      ],
      recursos: [
        { tipo: "Equipo en obra", nombre: "SR 90", sub: "Operativa", estado: "operativo" },
        { tipo: "Equipo en obra", nombre: "Casagrande", sub: "Operativa", estado: "operativo" },
        { tipo: "Equipo en obra", nombre: "Compresor Kaeser", sub: "Operativa", estado: "operativo" },
      ],
      pendientes: [
        { desc: "Pedir a Obed reporte del comportamiento y stock del pedido de insumos de polímero a JC Portal", responsable: "Obed", vence: "Esta semana", prioridad: "red", amarradoA: [] },
        { desc: "Estar encima de la fletera para gestión Panamá → Honduras del polímero + bomba Huskey", responsable: "Yo / Compras", vence: "Diario", prioridad: "red", amarradoA: [] },
        { desc: "Cotizar y sellar contenedor", responsable: "Yo / Compras", vence: "Esta semana", prioridad: "red", amarradoA: [] },
        { desc: "Conseguir gabeteros", responsable: "Yo", vence: "Esta semana", prioridad: "yellow", amarradoA: [] },
        { desc: "Compra de 6 camas matrimoniales", responsable: "Yo", vence: "Esta semana", prioridad: "yellow", amarradoA: [] },
        { desc: "Devolución de 5 camas unipersonales", responsable: "Yo", vence: "Esta semana", prioridad: "yellow", amarradoA: [] },
        { desc: "Mandar refri desde Tegus → SPS", responsable: "Yo / Logística", vence: "Esta semana", prioridad: "yellow", amarradoA: [] },
      ],
      escenarios: [],
      riesgos: [],
      contactos: [],
      notas: "",
    },
    {
      id: "p-amicci",
      usaAmarres: true,
      nombre: "Amicci",
      icono: "🌊",
      cliente: "Amicci",
      pm: "Dr. Edy Montalván",
      estado: "Movilización 8 may",
      estadoClass: "movilizacion",
      semaforo: "red",
      hitoProximo: "Movilización 8 may · A espera del cliente",
      objetivo: "Movilización 8 mayo Tegucigalpa → Omoa, a espera de confirmación del cliente. URGENTE: probar la YMB.",
      requerimientos: [
        { desc: "Generador 125 KVA / 200 A (si se usa YMB)", tipo: "local", necesaria: "Inicio proyecto", eta: "—", status: "cotizacion", responsable: "Yo", critico: true, notas: "Consolidar renta de generador" },
        { desc: "Generador 80 KVA + 60 KVA / 200 A (si se usan 2 STA)", tipo: "local", necesaria: "Inicio proyecto", eta: "—", status: "cotizacion", responsable: "Yo", critico: true, notas: "Consolidar renta de generador" },
        { desc: "Panel eléctrico (encontrar)", tipo: "local", necesaria: "Antes de movilización", eta: "—", status: "pendiente", responsable: "Ing. Ena", critico: true, notas: "Que Ena lo encuentre" },
        { desc: "Cotización rastra para movilización 8/05", tipo: "local", necesaria: "Antes 8 may", eta: "—", status: "cotizacion", responsable: "Yo / Logística", critico: true, notas: "Definir y cotizar" },
        { desc: "Costos operativos lowboy + Isuzu", tipo: "local", necesaria: "Antes 8 may", eta: "—", status: "cotizacion", responsable: "Yo / Logística", critico: true, notas: "Calcular" },
      ],
      recursos: [
        { tipo: "Equipo a movilizar", nombre: "Máquina YMB", sub: "Escenario A · Movilización 8 may", estado: "por-movilizar" },
        { tipo: "Equipo a movilizar", nombre: "2 Máquinas STA", sub: "Escenario B · Movilización 8 may", estado: "por-movilizar" },
        { tipo: "Equipo a movilizar", nombre: "Eurodrill", sub: "Movilización 8 may · estar encima que esté bien", estado: "por-movilizar" },
        { tipo: "Cuadrilla", nombre: "Ing. Ena", sub: "Ingeniera del proyecto", estado: "operativo" },
        { tipo: "Cuadrilla", nombre: "Pescado", sub: "Operador", estado: "operativo" },
        { tipo: "Cuadrilla", nombre: "Mario P", sub: "Operador Clivio", estado: "operativo" },
        { tipo: "Cuadrilla", nombre: "Gustavo Portillo", sub: "Ayudante", estado: "operativo" },
        { tipo: "Cuadrilla", nombre: "Luis Correa", sub: "Ayudante", estado: "operativo" },
        { tipo: "Cuadrilla", nombre: "Cacara", sub: "Ayudante", estado: "operativo" },
        { tipo: "Cuadrilla", nombre: "Junior", sub: "Motorista", estado: "operativo" },
      ],
      escenarios: [
        { titulo: "Escenario A — usar YMB", desc: "Si se usa la YMB en el proyecto, se necesita 1 generador de 125 KVA con 200 amperios." },
        { titulo: "Escenario B — usar 2 STA", desc: "Si se usan las 2 STA, se necesitan 2 generadores: uno de 80 KVA y otro de 60 KVA, ambos con 200 A de capacidad." },
      ],
      pendientes: [
        { desc: "URGENTE: probar la YMB", responsable: "Yo / Edy", vence: "YA", prioridad: "red", amarradoA: [] },
        { desc: "Consolidar renta de generador (escenarios YMB o 2 STA)", responsable: "Yo", vence: "Esta semana", prioridad: "red", amarradoA: [] },
        { desc: "Que Ena encuentre el panel eléctrico", responsable: "Ing. Ena", vence: "Esta semana", prioridad: "red", amarradoA: [] },
        { desc: "Definir y cotizar movilización rastra para 8/05", responsable: "Yo / Logística", vence: "Antes 8 may", prioridad: "red", amarradoA: [] },
        { desc: "Calcular costos operativos lowboy + Isuzu", responsable: "Yo / Logística", vence: "Antes 8 may", prioridad: "red", amarradoA: [] },
        { desc: "Estar encima que el Eurodrill esté bien", responsable: "Yo / Fernando", vence: "Antes 8 may", prioridad: "red", amarradoA: [] },
        { desc: "Esperar confirmación del cliente para movilización del 8 may", responsable: "Yo / Edy", vence: "Diario", prioridad: "red", amarradoA: [] },
      ],
      riesgos: [],
      contactos: [],
      notas: "",
    },
    {
      id: "p-aurea",
      usaAmarres: true,
      nombre: "Aurea - Galeas",
      icono: "👀",
      cliente: "Aurea - Galeas",
      pm: "Dr. Edy Montalván",
      estado: "Movilización 8 may · Inicio 11 may",
      estadoClass: "movilizacion",
      semaforo: "red",
      hitoProximo: "Movilización 8 may · Inicio operaciones 11 may",
      objetivo: "Movilizar equipos el 8 de mayo para iniciar operaciones el 11 de mayo. Proyecto que viene en camino.",
      requerimientos: [
        { desc: "Compresor adicional (definir cuál)", tipo: "local", necesaria: "Antes 8 may", eta: "—", status: "pendiente", responsable: "Yo", critico: true, notas: "Sabemos que uno será el 450-D, falta definir el otro" },
        { desc: "Martillo 5 pulgadas", tipo: "local", necesaria: "Antes 8 may", eta: "—", status: "cotizacion", responsable: "Roberto", critico: true, notas: "Roberto ya consiguió cotización · seguimiento a compra" },
        { desc: "Broca 6 pulgadas", tipo: "local", necesaria: "Antes 8 may", eta: "—", status: "cotizacion", responsable: "Roberto", critico: true, notas: "Roberto ya consiguió cotización · seguimiento a compra" },
      ],
      recursos: [
        { tipo: "Equipo a movilizar", nombre: "T-59 A", sub: "Máquinas debe entregarla · estar encima", estado: "por-movilizar" },
        { tipo: "Equipo a movilizar", nombre: "T-46-S2", sub: "Máquinas debe entregarla · estar encima", estado: "por-movilizar" },
        { tipo: "Equipo a movilizar", nombre: "Compresor 450-D", sub: "Movilización 8 may", estado: "por-movilizar" },
        { tipo: "Equipo a movilizar", nombre: "Compresor por definir", sub: "Falta definir cuál será el segundo", estado: "por-definir" },
      ],
      escenarios: [],
      pendientes: [
        { desc: "Estar encima que máquinas nos entregue T-59 A y T-46-S2", responsable: "Yo / Fernando", vence: "Antes 8 may", prioridad: "red", amarradoA: [{ tipo: "recurso", idx: 0 }, { tipo: "recurso", idx: 1 }] },
        { desc: "Definir cuál será el segundo compresor (uno es el 450-D)", responsable: "Yo", vence: "Antes 8 may", prioridad: "red", amarradoA: [{ tipo: "recurso", idx: 3 }] },
        { desc: "Seguimiento a compra de martillo 5\" y broca 6\" (Roberto consiguió cotización)", responsable: "Roberto / Compras", vence: "Antes 8 may", prioridad: "red", amarradoA: [{ tipo: "requerimiento", idx: 1 }, { tipo: "requerimiento", idx: 2 }] },
      ],
      riesgos: [],
      contactos: [],
      notas: "",
    },
    {
      id: "p-ccmicros",
      usaAmarres: true,
      nombre: "CC El Camino · Micropilotes",
      icono: "🛣️",
      cliente: "Desarrollos El Camino",
      pm: "Dr. Edy Montalván",
      estado: "Próximo · viene en camino",
      estadoClass: "movilizacion",
      semaforo: "yellow",
      hitoProximo: "Llegada de barras del extranjero",
      objetivo: "Proyecto que viene en camino. Estar pendiente de la llegada de las barras del extranjero.",
      requerimientos: [
        { desc: "Barras del extranjero", tipo: "import", necesaria: "Próximas semanas", eta: "Por confirmar", status: "transito", responsable: "Edy / Compras", critico: true, notas: "Estar pendiente de llegada" },
      ],
      recursos: [
        { tipo: "Equipo a movilizar", nombre: "Neumática", sub: "Cuando arranque", estado: "por-movilizar" },
        { tipo: "Equipo a movilizar", nombre: "Compresor 400B", sub: "Cuando arranque", estado: "por-movilizar" },
      ],
      escenarios: [],
      pendientes: [
        { desc: "Estar pendiente de llegada de barras del extranjero", responsable: "Yo / Edy", vence: "Semanal", prioridad: "red", amarradoA: [] },
      ],
      riesgos: [],
      contactos: [],
      notas: "",
    },
    {
      id: "p-ccanclajes",
      usaAmarres: true,
      nombre: "CC El Camino · Anclajes",
      icono: "⚓",
      cliente: "Desarrollos El Camino",
      pm: "Dr. Edy Montalván",
      estado: "Próximo · viene en camino",
      estadoClass: "por-iniciar",
      semaforo: "yellow",
      hitoProximo: "Producción de barras locales y materiales",
      objetivo: "Proyecto que viene en camino. Producir barras locales mientras se prepara materiales y cuadrilla.",
      requerimientos: [
        { desc: "Barra local #5 (producción interna)", tipo: "local", necesaria: "Continuo", eta: "En producción", status: "pendiente", responsable: "Torno", critico: true, notas: "Roscar 2 a 3 barras diarias" },
        { desc: "Barras para anclajes tipo 2", tipo: "local", necesaria: "Por definir", eta: "—", status: "cotizacion", responsable: "Roberto", critico: false, notas: "Seguimiento a cotización de Roberto" },
        { desc: "Materiales pequeños (lista de Neftalí)", tipo: "local", necesaria: "Antes del arranque", eta: "—", status: "pendiente", responsable: "Neftalí", critico: false, notas: "Pendiente que Neftalí mande la lista" },
      ],
      recursos: [
        { tipo: "Equipo a movilizar", nombre: "Neumática A", sub: "Cuando arranque", estado: "por-movilizar" },
        { tipo: "Equipo a movilizar", nombre: "Neumática B", sub: "Cuando arranque", estado: "por-movilizar" },
        { tipo: "Equipo a movilizar", nombre: "Compresor 400B", sub: "Cuando arranque", estado: "por-movilizar" },
        { tipo: "Equipo a movilizar", nombre: "Compresor 400C", sub: "Cuando arranque", estado: "por-movilizar" },
        { tipo: "Equipo a movilizar", nombre: "Planta de inyección C", sub: "Cuando arranque", estado: "por-movilizar" },
      ],
      escenarios: [],
      pendientes: [
        { desc: "Roscar 2 a 3 barras #5 diarias en torno", responsable: "Torno", vence: "Diario", prioridad: "red", amarradoA: [] },
        { desc: "Seguimiento a cotización de Roberto para barras anclajes tipo 2", responsable: "Roberto", vence: "Esta semana", prioridad: "yellow", amarradoA: [] },
        { desc: "Que Neftalí mande la lista de materiales pequeños", responsable: "Neftalí", vence: "Esta semana", prioridad: "yellow", amarradoA: [] },
        { desc: "Montar la cuadrilla", responsable: "Yo / Ingeniero", vence: "Antes del arranque", prioridad: "yellow", amarradoA: [] },
      ],
      riesgos: [],
      contactos: [],
      notas: "",
    },
    {
      id: "p-villaroy",
      usaAmarres: true,
      nombre: "Villaroy",
      icono: "🏘️",
      cliente: "Villaroy",
      pm: "Dr. Edy Montalván",
      estado: "Pendiente aprobación manguitos",
      estadoClass: "por-iniciar",
      semaforo: "yellow",
      hitoProximo: "Aprobación de manguitos",
      objetivo: "Si aprueban manguitos → comprar acero (ya hay cotización) y arrancar fabricación en torno. Sacar T-43 y compresor.",
      requerimientos: [
        { desc: "Acero para manguitos (cotización ya existe)", tipo: "local", necesaria: "Si aprueban", eta: "—", status: "cotizacion", responsable: "Compras", critico: false, notas: "Si aprueban → comprar y arrancar fabricación" },
      ],
      recursos: [
        { tipo: "Equipo a sacar", nombre: "T-43", sub: "Sacar para Villaroy", estado: "por-movilizar" },
        { tipo: "Equipo a sacar", nombre: "Compresor", sub: "Sacar para Villaroy", estado: "por-definir" },
      ],
      escenarios: [],
      pendientes: [
        { desc: "Estar pendiente de la aprobación de manguitos", responsable: "Yo / Edy", vence: "Diario", prioridad: "red", amarradoA: [] },
        { desc: "Si aprueban → comprar acero (ya hay cotización)", responsable: "Compras", vence: "Al aprobarse", prioridad: "yellow", amarradoA: [] },
        { desc: "Si aprueban → arrancar fabricación de manguitos en torno", responsable: "Torno", vence: "Al comprar acero", prioridad: "yellow", amarradoA: [] },
        { desc: "Sacar T-43 y compresor para Villaroy", responsable: "Yo / Logística", vence: "Cuando arranque", prioridad: "yellow", amarradoA: [] },
      ],
      riesgos: [],
      contactos: [],
      notas: "",
    },
    {
      id: "p-icon",
      usaAmarres: true,
      nombre: "Icon",
      icono: "🏢",
      cliente: "Grupo Icon",
      pm: "Dr. Edy Montalván",
      estado: "Pendiente fin de proyecto",
      estadoClass: "ejecucion",
      semaforo: "yellow",
      hitoProximo: "Llegada de carpa desde El Salvador",
      objetivo: "Habilitar motosoldadora, pendiente fin de proyecto, seguimiento a la carpa que viene desde El Salvador.",
      requerimientos: [
        { desc: "Carpa (desde El Salvador)", tipo: "import", necesaria: "Pronto", eta: "En tránsito", status: "transito", responsable: "Yo / Compras", critico: false, notas: "Seguimiento a llegada" },
      ],
      recursos: [
        { tipo: "Equipo", nombre: "Motosoldadora", sub: "Por habilitar", estado: "mantenimiento" },
      ],
      escenarios: [],
      pendientes: [
        { desc: "Habilitar motosoldadora", responsable: "Yo / Mecánico", vence: "Esta semana", prioridad: "yellow", amarradoA: [] },
        { desc: "Seguimiento a la carpa que viene desde El Salvador", responsable: "Yo / Compras", vence: "Semanal", prioridad: "yellow", amarradoA: [] },
        { desc: "Pendiente fin de proyecto", responsable: "Yo / Edy", vence: "Por definir", prioridad: null, amarradoA: [] },
      ],
      riesgos: [],
      contactos: [],
      notas: "",
    },
    {
      id: "p-fallakm57",
      usaAmarres: true,
      nombre: "Falla KM-57 Copán",
      icono: "⛰️",
      cliente: "Por definir",
      pm: "Dr. Edy Montalván",
      estado: "Por iniciar · Planificación",
      estadoClass: "por-iniciar",
      semaforo: "yellow",
      hitoProximo: "Reunión de planificación",
      objetivo: "Agendar reunión de planificación de proyecto (cuadrilla, equipos, insumos). Estar encima que la BG-11-A esté en óptimas condiciones.",
      requerimientos: [],
      recursos: [
        { tipo: "Equipo previsto", nombre: "BG-11-A", sub: "Estar encima que esté en óptimas condiciones", estado: "por-definir" },
      ],
      escenarios: [],
      pendientes: [
        { desc: "Agendar reunión de planificación de proyecto (cuadrilla, equipos, insumos)", responsable: "Yo / Edy", vence: "Esta semana", prioridad: "red", amarradoA: [] },
        { desc: "Estar encima que la BG-11-A esté en óptimas condiciones", responsable: "Yo / Fernando", vence: "Continuo", prioridad: "yellow", amarradoA: [] },
      ],
      riesgos: [],
      contactos: [],
      notas: "",
    },
    {
      id: "p-miramesi",
      usaAmarres: true,
      nombre: "Miramesi",
      icono: "🔧",
      cliente: "Miramesi",
      pm: "Dr. Edy Montalván",
      estado: "En espera",
      estadoClass: "gestion",
      semaforo: "gray",
      hitoProximo: "Tensado",
      objetivo: "Estar pendiente del tensado.",
      requerimientos: [],
      recursos: [],
      escenarios: [],
      pendientes: [
        { desc: "Estar pendiente de tensado", responsable: "Yo / Edy", vence: "Diario", prioridad: "yellow", amarradoA: [] },
      ],
      riesgos: [],
      contactos: [],
      notas: "",
    },
  ],

  pendientesGenerales: [
    { desc: "Terminar módulo de RRHH en Claude", responsable: "Yo", vence: "Esta semana", prioridad: "red", categoria: "Construcción interna" },
    { desc: "Subir cotizaciones al módulo de Compras de GeoControl", responsable: "Yo", vence: "Continuo", prioridad: "red", categoria: "Construcción interna" },
    { desc: "Entrevistar ingeniera junior en SPS", responsable: "Yo", vence: "Esta semana", prioridad: "yellow", categoria: "Contrataciones" },
    { desc: "Entrevistar ingeniero junior en TGU", responsable: "Yo", vence: "Esta semana", prioridad: "yellow", categoria: "Contrataciones" },
    { desc: "Buscar persona para área de RRHH", responsable: "Yo", vence: "Próximas semanas", prioridad: "yellow", categoria: "Contrataciones" },
    { desc: "Buscar persona para área de Logística", responsable: "Yo", vence: "Próximas semanas", prioridad: "yellow", categoria: "Contrataciones" },
    { desc: "Firma del Dr. Flores del convenio GeoForce", responsable: "Dr. Flores", vence: "Esta semana", prioridad: "red", categoria: "Gestión" },
  ],

  miDia: [],

  capacidad: {
    maquinas: [
      { categoria: "Pilotadoras", items: [
        { nombre: "SR 90", estado: "En obra", asignacion: "Ebenezer", notas: "" },
        { nombre: "Casagrande", estado: "En obra", asignacion: "Ebenezer", notas: "" },
        { nombre: "BG-11-A", estado: "Por confirmar", asignacion: "Falla KM-57 (previsto)", notas: "Estar encima que esté en óptimas condiciones" },
        { nombre: "YMB", estado: "Por probar", asignacion: "Amicci (Escenario A)", notas: "URGENTE probar" },
        { nombre: "STA #1", estado: "Plantel", asignacion: "Amicci (Escenario B)", notas: "" },
        { nombre: "STA #2", estado: "Plantel", asignacion: "Amicci (Escenario B)", notas: "" },
        { nombre: "T-43", estado: "Plantel", asignacion: "Villaroy (sacar)", notas: "" },
        { nombre: "T-59 A", estado: "Por entregar", asignacion: "Aurea-Galeas (8 may)", notas: "Estar encima que máquinas la entregue" },
        { nombre: "T-46-S2", estado: "Por entregar", asignacion: "Aurea-Galeas (8 may)", notas: "Estar encima que máquinas la entregue" },
        { nombre: "Eurodrill", estado: "Plantel", asignacion: "Amicci (8 may)", notas: "Estar encima que esté bien" },
      ]},
      { categoria: "Neumáticas", items: [
        { nombre: "Neumática (CC Micros)", estado: "Plantel", asignacion: "CC Camino Micros", notas: "" },
        { nombre: "Neumática A", estado: "Plantel", asignacion: "CC Camino Anclajes", notas: "" },
        { nombre: "Neumática B", estado: "Plantel", asignacion: "CC Camino Anclajes", notas: "" },
      ]},
      { categoria: "Compresores", items: [
        { nombre: "Compresor 400B", estado: "Plantel", asignacion: "CC Micros + CC Anclajes", notas: "⚠️ compartido entre 2 proyectos" },
        { nombre: "Compresor 400C", estado: "Plantel", asignacion: "CC Camino Anclajes", notas: "" },
        { nombre: "Compresor 450-D", estado: "Plantel", asignacion: "Aurea-Galeas (8 may)", notas: "" },
        { nombre: "Compresor Kaeser", estado: "En obra", asignacion: "Ebenezer", notas: "" },
        { nombre: "Compresor (Villaroy)", estado: "Por sacar", asignacion: "Villaroy", notas: "" },
        { nombre: "Compresor (segundo Aurea)", estado: "Por definir", asignacion: "Aurea-Galeas", notas: "Falta definir cuál" },
      ]},
      { categoria: "Plantas de inyección", items: [
        { nombre: "Planta de inyección C", estado: "Plantel", asignacion: "CC Camino Anclajes", notas: "" },
      ]},
      { categoria: "Otros equipos", items: [
        { nombre: "Motosoldadora", estado: "Plantel", asignacion: "Icon", notas: "Por habilitar" },
        { nombre: "2 Bombas Huskey", estado: "En tránsito", asignacion: "Ebenezer", notas: "Vienen con polímero desde Panamá" },
      ]},
    ],
    personal: [
      { categoria: "Cuadrilla Amicci", items: [
        { nombre: "Ing. Ena", rol: "Ingeniera del proyecto", estado: "Asignada", notas: "" },
        { nombre: "Pescado", rol: "Operador", estado: "Asignado", notas: "" },
        { nombre: "Mario P", rol: "Operador Clivio", estado: "Asignado", notas: "" },
        { nombre: "Gustavo Portillo", rol: "Ayudante", estado: "Asignado", notas: "" },
        { nombre: "Luis Correa", rol: "Ayudante", estado: "Asignado", notas: "" },
        { nombre: "Cacara", rol: "Ayudante", estado: "Asignado", notas: "" },
        { nombre: "Junior", rol: "Motorista", estado: "Asignado", notas: "" },
      ]},
      { categoria: "Cuadrilla Ebenezer", items: [
        { nombre: "Osue Pineda", rol: "Operador SR90", estado: "En obra", notas: "" },
        { nombre: "Edgar Iczano", rol: "Operador B125", estado: "En obra", notas: "" },
        { nombre: "Elvin Juanez", rol: "Operador Grúa", estado: "En obra", notas: "" },
      ]},
      { categoria: "Cuadrilla Apolo", items: [
        { nombre: "Don David", rol: "Residente", estado: "En obra", notas: "" },
        { nombre: "Kevin Sánchez", rol: "Operador", estado: "En obra", notas: "" },
      ]},
      { categoria: "Por contratar", items: [
        { nombre: "Asistente RRHH", rol: "Asistente Administrativo / RRHH", estado: "Búsqueda activa", notas: "Pendiente general" },
        { nombre: "Planner Logística", rol: "Planner / Gestor de Logística", estado: "Búsqueda activa", notas: "Pendiente general" },
        { nombre: "Ingeniero Junior TGU", rol: "Ingeniero junior", estado: "Por entrevistar", notas: "Pendiente general" },
        { nombre: "Ingeniera Junior SPS", rol: "Ingeniera junior", estado: "Por entrevistar", notas: "Pendiente general" },
        { nombre: "Mecánico SPS", rol: "Mecánico local", estado: "En búsqueda", notas: "" },
      ]},
    ],
    vehiculos: [
      { categoria: "Flota pesada", items: [
        { nombre: "Lowboy", estado: "Disponible", asignacion: "Movilizaciones", notas: "Calcular costo operativo Amicci" },
        { nombre: "Isuzu vivo", estado: "Disponible", asignacion: "Movilizaciones", notas: "Calcular costo operativo Amicci" },
      ]},
      { categoria: "Pendientes de data", items: [
        { nombre: "[Pedir lista a Fer]", estado: "—", asignacion: "—", notas: "Solicitar al departamento de máquinas el inventario completo de vehículos con kilometraje, mantenimientos, asignaciones" },
      ]},
    ],
  },
};

// ============ HELPERS ============
const clone = (x) => JSON.parse(JSON.stringify(x));
const semaforoEmoji = (s) => ({ red: "🔴", yellow: "🟡", green: "🟢", gray: "⚪" }[s] || "⚪");
const semaforoText = (s) => ({ red: "Crítico", yellow: "En riesgo", green: "En tiempo", gray: "En espera" }[s] || "En espera");

const ESTADO_RECURSO_MAP = {
  "por-movilizar": { color: "#F59E0B", bg: "rgba(245,158,11,0.15)", label: "🟡 Por movilizar" },
  "en-transito": { color: "#3B82F6", bg: "rgba(59,130,246,0.15)", label: "🚛 En tránsito" },
  "en-obra": { color: "#10B981", bg: "rgba(16,185,129,0.15)", label: "🟢 En obra" },
  "operativo": { color: "#10B981", bg: "rgba(16,185,129,0.15)", label: "✅ Operativo" },
  "mantenimiento": { color: "#EF4444", bg: "rgba(239,68,68,0.15)", label: "🔧 Mantenimiento" },
  "por-definir": { color: "#94A3B8", bg: "rgba(148,163,184,0.15)", label: "❓ Por definir" },
};

const ESTADO_CLASS_BG = {
  movilizacion: { bg: "rgba(245,158,11,0.2)", color: "#FBBF24" },
  ejecucion: { bg: "rgba(16,185,129,0.2)", color: "#34D399" },
  "por-iniciar": { bg: "rgba(59,130,246,0.2)", color: "#60A5FA" },
  gestion: { bg: "rgba(139,92,246,0.2)", color: "#A78BFA" },
};

const NIVEL_RIESGO_MAP = {
  critico: { color: "#DC2626", emoji: "🔴", label: "Crítico" },
  alto: { color: "#EA580C", emoji: "🟠", label: "Alto" },
  medio: { color: "#F59E0B", emoji: "🟡", label: "Medio" },
};

// ============ COMPONENTE PRINCIPAL ============
export default function OperationsModule({ userRole, userName, onBack, onLogout }) {
  const isReadOnly = userRole === "gerencia" || userRole === "costos" || userRole === "tesoreria";
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("inicio");
  const [capTab, setCapTab] = useState("maquinas");
  const [modal, setModal] = useState(null); // { kind, params, draft }
  const saveTimer = useRef(null);

  // === Cargar datos al inicio ===
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await store.get(STORE_KEY);
      if (cancelled) return;
      // Si no hay datos en la nube, sembrar con la data inicial
      setData(saved && saved.proyectos ? saved : clone(SEED));
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // === Guardar con debounce ===
  useEffect(() => {
    if (!loaded || !data) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      store.set(STORE_KEY, data);
    }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [data, loaded]);

  // === Mutador genérico ===
  const mutate = (fn) => {
    setData((prev) => {
      const next = clone(prev);
      fn(next);
      return next;
    });
  };

  if (!data) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, color: C.text, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <div style={{ color: C.textLo }}>Cargando Operations Command Center...</div>
        </div>
      </div>
    );
  }

  // === KPIs globales ===
  const totalCriticos = data.proyectos.reduce((a, p) => a + p.requerimientos.filter((r) => r.critico && r.status !== "entregado").length, 0);
  const totalPendientes = data.proyectos.reduce((a, p) => a + p.pendientes.filter((t) => !t.hecho).length, 0);
  const totalUrgentes = (() => {
    let n = 0;
    data.proyectos.forEach((p) => p.pendientes.forEach((t) => { if (!t.hecho && t.prioridad === "red") n++; }));
    data.pendientesGenerales.forEach((t) => { if (!t.hecho && t.prioridad === "red") n++; });
    return n;
  })();
  const pendsGenerales = data.pendientesGenerales.filter((t) => !t.hecho).length;

  // === Mi día helpers ===
  const estaEnMiDia = (tipo, proyectoId, idx) => {
    return (data.miDia || []).some((ref) => {
      if (tipo === "proyecto") return ref.tipo === "proyecto" && ref.proyectoId === proyectoId && ref.idx === idx;
      if (tipo === "general") return ref.tipo === "general" && ref.idx === idx;
      return false;
    });
  };
  const toggleEstrellaProyecto = (proyectoId, idx) => mutate((d) => {
    const i = d.miDia.findIndex((r) => r.tipo === "proyecto" && r.proyectoId === proyectoId && r.idx === idx);
    if (i >= 0) d.miDia.splice(i, 1);
    else d.miDia.push({ tipo: "proyecto", proyectoId, idx });
  });
  const toggleEstrellaGeneral = (idx) => mutate((d) => {
    const i = d.miDia.findIndex((r) => r.tipo === "general" && r.idx === idx);
    if (i >= 0) d.miDia.splice(i, 1);
    else d.miDia.push({ tipo: "general", idx });
  });

  // === CRUD: pendientes (acciones) ===
  const togglePendiente = (proyectoId, idx) => mutate((d) => {
    const p = d.proyectos.find((x) => x.id === proyectoId);
    p.pendientes[idx].hecho = !p.pendientes[idx].hecho;
  });
  const togglePendienteGeneral = (idx) => mutate((d) => {
    d.pendientesGenerales[idx].hecho = !d.pendientesGenerales[idx].hecho;
  });
  const toggleMiDiaItem = (ref) => mutate((d) => {
    if (ref.tipo === "proyecto") {
      const p = d.proyectos.find((x) => x.id === ref.proyectoId);
      if (p && p.pendientes[ref.idx]) p.pendientes[ref.idx].hecho = !p.pendientes[ref.idx].hecho;
    } else if (ref.tipo === "general") {
      if (d.pendientesGenerales[ref.idx]) d.pendientesGenerales[ref.idx].hecho = !d.pendientesGenerales[ref.idx].hecho;
    }
  });
  const quitarDeMiDia = (ref) => mutate((d) => {
    const i = d.miDia.findIndex((r) => {
      if (r.tipo !== ref.tipo) return false;
      if (r.tipo === "proyecto") return r.proyectoId === ref.proyectoId && r.idx === ref.idx;
      return r.idx === ref.idx;
    });
    if (i >= 0) d.miDia.splice(i, 1);
  });

  // === CRUD: eliminación ===
  const deleteFromProject = (proyectoId, tipo, idx) => mutate((d) => {
    const p = d.proyectos.find((x) => x.id === proyectoId);
    if (!p || !p[tipo]) return;
    p[tipo].splice(idx, 1);
    // Si borramos un pendiente, limpiar miDia
    if (tipo === "pendientes") {
      d.miDia = d.miDia.filter((r) => !(r.tipo === "proyecto" && r.proyectoId === proyectoId && r.idx === idx)).map((r) => {
        if (r.tipo === "proyecto" && r.proyectoId === proyectoId && r.idx > idx) return { ...r, idx: r.idx - 1 };
        return r;
      });
    }
    // Si borramos un recurso o requerimiento, limpiar amarres en pendientes
    if (tipo === "recursos" || tipo === "requerimientos") {
      const tipoAmarre = tipo === "recursos" ? "recurso" : "requerimiento";
      p.pendientes.forEach((t) => {
        if (t.amarradoA && t.amarradoA.length) {
          t.amarradoA = t.amarradoA.filter((a) => !(a.tipo === tipoAmarre && a.idx === idx)).map((a) => {
            if (a.tipo === tipoAmarre && a.idx > idx) return { ...a, idx: a.idx - 1 };
            return a;
          });
        }
      });
    }
  });
  const deleteGeneral = (idx) => mutate((d) => {
    d.pendientesGenerales.splice(idx, 1);
    d.miDia = d.miDia.filter((r) => !(r.tipo === "general" && r.idx === idx)).map((r) => {
      if (r.tipo === "general" && r.idx > idx) return { ...r, idx: r.idx - 1 };
      return r;
    });
  });
  const deleteCapItem = (seccion, catIdx, itemIdx) => mutate((d) => {
    d.capacidad[seccion][catIdx].items.splice(itemIdx, 1);
  });

  // === Modal helpers ===
  const openModal = (kind, params = {}) => {
    setModal({ kind, params, draft: buildInitialDraft(kind, params, data) });
  };
  const closeModal = () => setModal(null);
  const updateDraft = (patch) => setModal((m) => ({ ...m, draft: { ...m.draft, ...patch } }));

  const saveModal = () => {
    if (!modal) return;
    const ok = applyModalSave(modal, mutate);
    if (ok) closeModal();
  };

  // === Notas del proyecto ===
  const setNotasProyecto = (proyectoId, valor) => mutate((d) => {
    const p = d.proyectos.find((x) => x.id === proyectoId);
    if (p) p.notas = valor;
  });

  // === Renderizado ===
  const TABS = [
    { id: "inicio", label: "🏠 Inicio" },
    { id: "mi-dia", label: "⭐ Mi día" },
    { id: "consolidado", label: "📊 Proyectos" },
    ...data.proyectos.map((p) => ({ id: p.id, label: `${p.icono} ${p.nombre}` })),
    { id: "pendientes-generales", label: "📋 Pendientes Grales" },
    { id: "capacidad", label: "📊 Capacidad" },
  ];

  const proyectoActual = data.proyectos.find((p) => p.id === tab);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: 18, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth: 1500, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ background: `linear-gradient(135deg, ${C.card} 0%, ${C.bg} 100%)`, borderLeft: `5px solid ${C.accent}`, padding: "20px 26px", borderRadius: 12, marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ flexShrink: 0 }}>
              <Logo size={42} showText={false} />
            </div>
            <div style={{ borderLeft: `1px solid ${C.border}`, paddingLeft: 18 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.accent, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>Command Center</div>
              <h1 style={{ fontSize: 22, color: C.textHi, marginBottom: 2, fontWeight: 800, letterSpacing: -0.3 }}>Dirección de Operaciones</h1>
              <div style={{ fontSize: 12, color: C.textLo }}>Geotecnica Soluciones · Vista operativa en tiempo real</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ background: C.accent, color: "white", padding: "8px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600, boxShadow: "0 2px 8px rgba(232,118,45,0.25)" }}>
              {userName || "Lic. Gerson Trochez"}
            </div>
            <button onClick={onBack} style={btn(C.card, C.text, C.border)}>← Volver al panel</button>
            <button onClick={onLogout} style={btn(C.card, C.text, C.border)}>Cerrar sesión</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, marginBottom: 18, borderBottom: `2px solid ${C.card}`, flexWrap: "wrap" }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); window.scrollTo(0, 0); }}
              style={{
                padding: "10px 16px",
                cursor: "pointer",
                background: tab === t.id ? "rgba(217,119,6,0.05)" : "transparent",
                border: "none",
                color: tab === t.id ? C.accent : C.textLo,
                fontSize: 13,
                fontWeight: tab === t.id ? 600 : 500,
                borderBottom: `3px solid ${tab === t.id ? C.accent : "transparent"}`,
                fontFamily: "inherit",
                marginBottom: -2,
                transition: "all 0.15s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Banner solo lectura */}
        {isReadOnly && (
          <div style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(96,165,250,0.4)", color: "#60A5FA", padding: "10px 16px", borderRadius: 8, marginBottom: 14, fontSize: 13, fontWeight: 600 }}>
            👁️ Modo solo lectura — podés ver toda la información pero no editar ni guardar cambios.
          </div>
        )}

        {/* Contenido */}
        <fieldset disabled={isReadOnly} style={{ border: "none", padding: 0, margin: 0, minWidth: 0 }}>
          {tab === "inicio" && (
            <InicioView
              data={data}
              totalCriticos={totalCriticos}
              totalPendientes={totalPendientes}
              totalUrgentes={totalUrgentes}
              pendsGenerales={pendsGenerales}
              goTo={setTab}
            />
          )}
          {tab === "mi-dia" && (
            <MiDiaView data={data} toggleItem={toggleMiDiaItem} quitar={quitarDeMiDia} />
          )}
          {tab === "consolidado" && (
            <ConsolidadoView data={data} goTo={setTab} />
          )}
          {tab === "pendientes-generales" && (
            <PendientesGeneralesView
              data={data}
              esFavorito={(idx) => estaEnMiDia("general", null, idx)}
              toggle={togglePendienteGeneral}
              toggleEstrella={toggleEstrellaGeneral}
              del={deleteGeneral}
              openModal={openModal}
            />
          )}
          {tab === "capacidad" && (
            <CapacidadView
              data={data}
              capTab={capTab}
              setCapTab={setCapTab}
              del={deleteCapItem}
              openModal={openModal}
            />
          )}
          {proyectoActual && (
            <ProyectoView
              p={proyectoActual}
              data={data}
              esFavorito={(idx) => estaEnMiDia("proyecto", proyectoActual.id, idx)}
              toggleEstrella={(idx) => toggleEstrellaProyecto(proyectoActual.id, idx)}
              togglePendiente={(idx) => togglePendiente(proyectoActual.id, idx)}
              del={(tipo, idx) => deleteFromProject(proyectoActual.id, tipo, idx)}
              openModal={openModal}
              setNotas={(v) => setNotasProyecto(proyectoActual.id, v)}
              goTo={setTab}
            />
          )}
        </fieldset>

        {/* Modal */}
        {modal && !isReadOnly && (
          <ModalShell onClose={closeModal}>
            <ModalForm modal={modal} updateDraft={updateDraft} data={data} onSave={saveModal} onClose={closeModal} />
          </ModalShell>
        )}
      </div>
    </div>
  );
}

// ============ DRAFTS / SAVE LOGIC ============
function buildInitialDraft(kind, params, data) {
  const findP = (id) => data.proyectos.find((x) => x.id === id);
  switch (kind) {
    case "edit-proyecto-meta": {
      const p = findP(params.proyectoId);
      return { nombre: p.nombre, cliente: p.cliente, pm: p.pm, estado: p.estado, hitoProximo: p.hitoProximo, semaforo: p.semaforo, objetivo: p.objetivo || "" };
    }
    case "add-requerimiento":
      return { desc: "", tipo: "local", necesaria: "", eta: "—", status: "pendiente", responsable: "Yo", notas: "", critico: false };
    case "edit-requerimiento": {
      const r = findP(params.proyectoId).requerimientos[params.idx];
      return { ...r };
    }
    case "add-recurso": {
      const p = findP(params.proyectoId);
      return { tipo: "Equipo a movilizar", nombre: "", sub: "", estado: p.usaAmarres ? "por-movilizar" : undefined };
    }
    case "edit-recurso": {
      const r = findP(params.proyectoId).recursos[params.idx];
      return { ...r };
    }
    case "add-pendiente":
      return { desc: "", responsable: "Yo", vence: "", prioridad: "", amarradoA: [] };
    case "edit-pendiente": {
      const t = findP(params.proyectoId).pendientes[params.idx];
      return { desc: t.desc, responsable: t.responsable, vence: t.vence, prioridad: t.prioridad || "", amarradoA: t.amarradoA ? clone(t.amarradoA) : [] };
    }
    case "add-riesgo":
      return { desc: "", nivel: "medio", mitigacion: "" };
    case "edit-riesgo": {
      const r = findP(params.proyectoId).riesgos[params.idx];
      return { ...r };
    }
    case "add-contacto":
      return { nombre: "", rol: "", telefono: "", notas: "" };
    case "edit-contacto": {
      const c = findP(params.proyectoId).contactos[params.idx];
      return { ...c };
    }
    case "add-escenario":
      return { titulo: "", desc: "" };
    case "edit-escenario": {
      const e = findP(params.proyectoId).escenarios[params.idx];
      return { ...e };
    }
    case "add-general":
      return { desc: "", responsable: "Yo", vence: "", categoria: "", prioridad: "" };
    case "edit-general": {
      const t = data.pendientesGenerales[params.idx];
      return { desc: t.desc, responsable: t.responsable, vence: t.vence, categoria: t.categoria || "", prioridad: t.prioridad || "" };
    }
    case "add-cap-item": {
      const esPersonal = params.seccion === "personal";
      return { nombre: "", estado: "", notas: "", ...(esPersonal ? { rol: "" } : { asignacion: "" }) };
    }
    case "edit-cap-item": {
      const item = data.capacidad[params.seccion][params.catIdx].items[params.itemIdx];
      return { ...item };
    }
    case "add-cap-categoria":
      return { nombre: "" };
    default:
      return {};
  }
}

function applyModalSave(modal, mutate) {
  const { kind, params, draft } = modal;
  const findP = (d, id) => d.proyectos.find((x) => x.id === id);
  switch (kind) {
    case "edit-proyecto-meta":
      mutate((d) => {
        const p = findP(d, params.proyectoId);
        Object.assign(p, draft);
      });
      return true;
    case "add-requerimiento": {
      if (!draft.desc.trim()) { alert("La descripción es obligatoria"); return false; }
      mutate((d) => {
        const p = findP(d, params.proyectoId);
        p.requerimientos.push({ ...draft, necesaria: draft.necesaria || "Por definir", eta: draft.eta || "—" });
      });
      return true;
    }
    case "edit-requerimiento":
      mutate((d) => {
        const r = findP(d, params.proyectoId).requerimientos[params.idx];
        Object.assign(r, draft);
      });
      return true;
    case "add-recurso": {
      if (!draft.nombre.trim()) { alert("El nombre es obligatorio"); return false; }
      mutate((d) => {
        const p = findP(d, params.proyectoId);
        p.recursos.push({ ...draft });
      });
      return true;
    }
    case "edit-recurso":
      mutate((d) => {
        const r = findP(d, params.proyectoId).recursos[params.idx];
        Object.assign(r, draft);
      });
      return true;
    case "add-pendiente": {
      if (!draft.desc.trim()) { alert("La descripción es obligatoria"); return false; }
      mutate((d) => {
        const p = findP(d, params.proyectoId);
        const obj = {
          desc: draft.desc,
          responsable: draft.responsable || "Yo",
          vence: draft.vence || "Sin fecha",
          prioridad: draft.prioridad || null,
          hecho: false,
        };
        if (p.usaAmarres) obj.amarradoA = draft.amarradoA || [];
        p.pendientes.push(obj);
      });
      return true;
    }
    case "edit-pendiente":
      mutate((d) => {
        const p = findP(d, params.proyectoId);
        const t = p.pendientes[params.idx];
        t.desc = draft.desc;
        t.responsable = draft.responsable;
        t.vence = draft.vence;
        t.prioridad = draft.prioridad || null;
        if (p.usaAmarres) t.amarradoA = draft.amarradoA || [];
      });
      return true;
    case "add-riesgo": {
      if (!draft.desc.trim()) { alert("La descripción es obligatoria"); return false; }
      mutate((d) => {
        const p = findP(d, params.proyectoId);
        if (!p.riesgos) p.riesgos = [];
        p.riesgos.push({ ...draft });
      });
      return true;
    }
    case "edit-riesgo":
      mutate((d) => {
        const r = findP(d, params.proyectoId).riesgos[params.idx];
        Object.assign(r, draft);
      });
      return true;
    case "add-contacto": {
      if (!draft.nombre.trim()) { alert("El nombre es obligatorio"); return false; }
      mutate((d) => {
        const p = findP(d, params.proyectoId);
        if (!p.contactos) p.contactos = [];
        p.contactos.push({ ...draft });
      });
      return true;
    }
    case "edit-contacto":
      mutate((d) => {
        const c = findP(d, params.proyectoId).contactos[params.idx];
        Object.assign(c, draft);
      });
      return true;
    case "add-escenario": {
      if (!draft.titulo.trim()) { alert("El título es obligatorio"); return false; }
      mutate((d) => {
        const p = findP(d, params.proyectoId);
        if (!p.escenarios) p.escenarios = [];
        p.escenarios.push({ ...draft });
      });
      return true;
    }
    case "edit-escenario":
      mutate((d) => {
        const e = findP(d, params.proyectoId).escenarios[params.idx];
        Object.assign(e, draft);
      });
      return true;
    case "add-general": {
      if (!draft.desc.trim()) { alert("La descripción es obligatoria"); return false; }
      mutate((d) => {
        d.pendientesGenerales.push({
          desc: draft.desc,
          responsable: draft.responsable || "Yo",
          vence: draft.vence || "Sin fecha",
          categoria: draft.categoria || "General",
          prioridad: draft.prioridad || null,
          hecho: false,
        });
      });
      return true;
    }
    case "edit-general":
      mutate((d) => {
        const t = d.pendientesGenerales[params.idx];
        t.desc = draft.desc;
        t.responsable = draft.responsable;
        t.vence = draft.vence;
        t.categoria = draft.categoria || "General";
        t.prioridad = draft.prioridad || null;
      });
      return true;
    case "add-cap-item": {
      if (!draft.nombre.trim()) { alert("El nombre es obligatorio"); return false; }
      mutate((d) => {
        d.capacidad[params.seccion][params.catIdx].items.push({ ...draft, estado: draft.estado || "—" });
      });
      return true;
    }
    case "edit-cap-item":
      mutate((d) => {
        const item = d.capacidad[params.seccion][params.catIdx].items[params.itemIdx];
        Object.assign(item, draft);
      });
      return true;
    case "add-cap-categoria": {
      if (!draft.nombre.trim()) { alert("El nombre es obligatorio"); return false; }
      mutate((d) => {
        d.capacidad[params.seccion].push({ categoria: draft.nombre, items: [] });
      });
      return true;
    }
    default:
      return true;
  }
}

// ============ COMPONENTES DE VISTA ============

function InicioView({ data, totalCriticos, totalPendientes, totalUrgentes, pendsGenerales, goTo }) {
  const todosUrgentes = [];
  data.proyectos.forEach((p) => {
    p.pendientes.forEach((t, idx) => {
      if (!t.hecho && t.prioridad === "red") todosUrgentes.push({ ...t, proyecto: `${p.icono} ${p.nombre}`, proyectoId: p.id, idx });
    });
  });
  data.pendientesGenerales.forEach((t, idx) => {
    if (!t.hecho && t.prioridad === "red") todosUrgentes.push({ ...t, proyecto: "📋 Pendientes Generales", proyectoId: "pendientes-generales", idx });
  });

  const hoy = new Date().toLocaleDateString("es-HN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      <DetailHeader>
        <h2 style={{ fontSize: 22, color: C.textHi, marginBottom: 4 }}>🏠 Inicio · Resumen Ejecutivo</h2>
        <Meta>
          <span><strong style={{ color: C.textMid }}>Coordinador:</strong> Lic. Gerson Trochez</span>
          <span><strong style={{ color: C.textMid }}>Hoy:</strong> {hoy}</span>
        </Meta>
      </DetailHeader>

      <div style={{ background: "linear-gradient(90deg, rgba(220,38,38,0.15) 0%, rgba(220,38,38,0.05) 100%)", borderLeft: `4px solid ${C.red}`, padding: "12px 16px", borderRadius: 6, marginBottom: 14 }}>
        <strong style={{ color: C.redLight }}>🔥 Foco de la semana</strong>
        <p style={{ fontSize: 12.5, color: "#FCA5A5", marginTop: 4 }}>
          {totalCriticos} requerimientos críticos abiertos · {todosUrgentes.length} pendientes urgentes en total · {data.proyectos.length} proyectos activos
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 22 }}>
        <KpiTop color={C.purple} label="⭐ Mi día" value={data.miDia.length} foot="items marcados →" onClick={() => goTo("mi-dia")} />
        <KpiTop color={C.accent} label="📊 Proyectos activos" value={data.proyectos.length} foot={`${totalPendientes} pendientes en total →`} onClick={() => goTo("consolidado")} />
        <KpiTop color={C.red} label="🔴 Urgentes" value={totalUrgentes} foot="en rojo · sin completar" />
        <KpiTop color={C.green} label="📋 Pendientes Grales" value={pendsGenerales} foot="construcción interna →" onClick={() => goTo("pendientes-generales")} />
      </div>

      <Block title="🔴 Top urgentes — todo lo crítico abierto" count={`${todosUrgentes.length} items`}>
        {todosUrgentes.length === 0 ? (
          <p style={{ color: C.textDim, fontSize: 13, fontStyle: "italic", padding: 10 }}>No hay items urgentes abiertos. 🎉</p>
        ) : (
          todosUrgentes.map((t, i) => (
            <div key={i} style={{ background: C.bg, borderRadius: 8, padding: "11px 14px", marginBottom: 7, display: "flex", gap: 11, alignItems: "flex-start", borderLeft: `3px solid ${C.red}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, color: C.text, marginBottom: 4 }}>
                  <strong style={{ color: C.accentLight }}>[{t.proyecto}]</strong> {t.desc}
                </div>
                <div style={{ fontSize: 10.5, color: C.textDim, display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span><strong style={{ color: C.textLo }}>👤</strong> {t.responsable}</span>
                  <span><strong style={{ color: C.textLo }}>📅</strong> {t.vence}</span>
                </div>
              </div>
              <button onClick={() => goTo(t.proyectoId)} style={{ background: C.accent, color: "white", border: "none", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>Ir →</button>
            </div>
          ))
        )}
      </Block>

      <Block title="🚦 Estado de proyectos · resumen rápido">
        <table style={tStyle}>
          <thead>
            <tr>
              <th style={thStyle}></th>
              <th style={thStyle}>Proyecto</th>
              <th style={thStyle}>Estado</th>
              <th style={thStyle}>Hito próximo</th>
              <th style={thStyle}>Críticos</th>
              <th style={thStyle}>Pendientes</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {data.proyectos.map((p) => {
              const reqCrit = p.requerimientos.filter((r) => r.critico && r.status !== "entregado").length;
              const pends = p.pendientes.filter((t) => !t.hecho).length;
              return (
                <tr key={p.id}>
                  <td style={tdStyle}><Semaforo kind={p.semaforo} /></td>
                  <td style={tdStyle}><strong style={{ color: C.textHi }}>{p.icono} {p.nombre}</strong></td>
                  <td style={{ ...tdStyle, fontSize: 11 }}>{p.estado}</td>
                  <td style={{ ...tdStyle, fontSize: 11, color: C.textLo }}>{p.hitoProximo}</td>
                  <td style={{ ...tdStyle, textAlign: "center" }}><strong style={{ color: reqCrit > 0 ? C.redLight : C.greenLight }}>{reqCrit}</strong></td>
                  <td style={{ ...tdStyle, textAlign: "center" }}><strong>{pends}</strong></td>
                  <td style={tdStyle}>
                    <button onClick={() => goTo(p.id)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.textLo, padding: "4px 10px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Ver →</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Block>
    </>
  );
}

function MiDiaView({ data, toggleItem, quitar }) {
  const items = (data.miDia || []).map((ref) => {
    if (ref.tipo === "proyecto") {
      const p = data.proyectos.find((x) => x.id === ref.proyectoId);
      if (!p || !p.pendientes[ref.idx]) return null;
      return { ...p.pendientes[ref.idx], origen: `${p.icono} ${p.nombre}`, ref };
    } else if (ref.tipo === "general") {
      const t = data.pendientesGenerales[ref.idx];
      if (!t) return null;
      return { ...t, origen: "📋 Pendientes Generales", ref };
    }
    return null;
  }).filter(Boolean);

  const urgentes = items.filter((i) => i.prioridad === "red" && !i.hecho);
  const importantes = items.filter((i) => i.prioridad === "yellow" && !i.hecho);
  const normales = items.filter((i) => !i.prioridad && !i.hecho);
  const hechos = items.filter((i) => i.hecho);

  return (
    <>
      <DetailHeader>
        <h2 style={{ fontSize: 22, color: C.textHi, marginBottom: 4 }}>⭐ Mi día</h2>
        <Meta>
          <span><strong style={{ color: C.textMid }}>Lic. Gerson Trochez · Coordinador de Operaciones</strong></span>
          <span>{new Date().toLocaleDateString("es-HN", { weekday: "long", day: "numeric", month: "long" })}</span>
        </Meta>
      </DetailHeader>

      <InfoStrip>
        <strong style={{ color: C.purpleLight }}>🎯 ¿Cómo funciona Mi día?</strong>
        <p>En cualquier proyecto, hacé click en la <strong>⭐</strong> de un pendiente para agregarlo a tu día. Acá ves todo lo que marcaste, en una sola pantalla. Cuando termines algo, marcalo como hecho y desaparece de la lista.</p>
      </InfoStrip>

      {items.length === 0 ? (
        <Block>
          <div style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 42, marginBottom: 14 }}>⭐</div>
            <h3 style={{ marginBottom: 10, color: C.textHi }}>Tu día está vacío</h3>
            <p style={{ color: C.textLo, fontSize: 13 }}>Andá a cualquier proyecto o a Pendientes Generales y marcá pendientes con la estrella ⭐ para que aparezcan acá.</p>
          </div>
        </Block>
      ) : (
        <>
          {urgentes.length > 0 && (
            <Block title="🔴 Urgentes" count={urgentes.length} titleColor={C.redLight}>
              {urgentes.map((t, i) => <MiDiaItemRow key={i} t={t} toggleItem={toggleItem} quitar={quitar} />)}
            </Block>
          )}
          {importantes.length > 0 && (
            <Block title="🟡 Importantes" count={importantes.length} titleColor={C.accentLight}>
              {importantes.map((t, i) => <MiDiaItemRow key={i} t={t} toggleItem={toggleItem} quitar={quitar} />)}
            </Block>
          )}
          {normales.length > 0 && (
            <Block title="⚪ Normales" count={normales.length}>
              {normales.map((t, i) => <MiDiaItemRow key={i} t={t} toggleItem={toggleItem} quitar={quitar} />)}
            </Block>
          )}
          {hechos.length > 0 && (
            <Block title="✅ Completados hoy" count={hechos.length} titleColor={C.greenLight}>
              {hechos.map((t, i) => <MiDiaItemRow key={i} t={t} toggleItem={toggleItem} quitar={quitar} />)}
            </Block>
          )}
        </>
      )}
    </>
  );
}

function MiDiaItemRow({ t, toggleItem, quitar }) {
  const borderColor = t.prioridad === "red" ? C.red : t.prioridad === "yellow" ? C.yellow : C.border;
  return (
    <div style={{ background: C.bg, borderRadius: 8, padding: "11px 14px", marginBottom: 7, display: "flex", alignItems: "flex-start", gap: 11, borderLeft: `3px solid ${borderColor}`, opacity: t.hecho ? 0.5 : 1 }}>
      <input type="checkbox" checked={!!t.hecho} onChange={() => toggleItem(t.ref)} style={{ marginTop: 3, width: 16, height: 16, cursor: "pointer", accentColor: C.accent }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, color: t.hecho ? C.textDim : C.text, marginBottom: 4, textDecoration: t.hecho ? "line-through" : "none" }}>
          <strong style={{ color: C.purpleLight, fontSize: 11 }}>[{t.origen}]</strong><br />{t.desc}
        </div>
        <div style={{ fontSize: 10.5, color: C.textDim, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span><strong style={{ color: C.textLo }}>👤</strong> {t.responsable}</span>
          <span><strong style={{ color: C.textLo }}>📅</strong> {t.vence}</span>
        </div>
      </div>
      <BtnIcon variant="danger" onClick={() => quitar(t.ref)} title="Quitar de mi día">✕</BtnIcon>
    </div>
  );
}

function ConsolidadoView({ data, goTo }) {
  return (
    <>
      <div style={{ background: "linear-gradient(90deg, rgba(220,38,38,0.15) 0%, rgba(220,38,38,0.05) 100%)", borderLeft: `4px solid ${C.red}`, padding: "12px 16px", borderRadius: 6, marginBottom: 14 }}>
        <strong style={{ color: C.redLight }}>⚠️ Vista consolidada de proyectos</strong>
        <p style={{ fontSize: 12.5, color: "#FCA5A5", marginTop: 4 }}>Hacé click en cualquier proyecto para ver el detalle completo. El semáforo te dice el estado de un vistazo.</p>
      </div>
      {data.proyectos.map((p) => {
        const reqCriticos = p.requerimientos.filter((r) => r.critico && r.status !== "entregado").length;
        const pendientesAbiertos = p.pendientes.filter((t) => !t.hecho).length;
        const ec = ESTADO_CLASS_BG[p.estadoClass] || { bg: "#334155", color: C.textMid };
        const semColor = { red: C.red, yellow: C.yellow, green: C.green, gray: C.textDim }[p.semaforo] || C.textDim;
        return (
          <div
            key={p.id}
            onClick={() => goTo(p.id)}
            style={{ background: C.card, borderRadius: 10, padding: "18px 22px", marginBottom: 12, borderLeft: `4px solid ${semColor}`, cursor: "pointer", transition: "all 0.15s" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = C.cardHover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = C.card)}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: C.textHi }}>{p.icono} {p.nombre}</div>
                <div style={{ fontSize: 12, color: C.textLo, marginTop: 2 }}>{p.cliente} · PM: {p.pm}</div>
              </div>
              <div style={{ background: ec.bg, color: ec.color, padding: "4px 11px", borderRadius: 14, fontSize: 10, fontWeight: 600, textTransform: "uppercase" }}>{p.estado}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
              <Metric label="Estado" value={`${semaforoEmoji(p.semaforo)} ${semaforoText(p.semaforo)}`} />
              <Metric label="Hito próximo" value={p.hitoProximo} small />
              <Metric label="Req. críticos" value={reqCriticos} valueColor={reqCriticos > 0 ? C.redLight : C.greenLight} />
              <Metric label="Pendientes" value={pendientesAbiertos} valueColor={pendientesAbiertos > 3 ? C.accentLight : undefined} />
              <Metric label="Requerimientos" value={p.requerimientos.length} />
            </div>
          </div>
        );
      })}
    </>
  );
}

function ProyectoView({ p, data, esFavorito, toggleEstrella, togglePendiente, del, openModal, setNotas, goTo }) {
  const [notasLocal, setNotasLocal] = useState(p.notas || "");
  useEffect(() => { setNotasLocal(p.notas || ""); }, [p.id, p.notas]);

  return (
    <>
      <DetailHeader>
        <button onClick={() => goTo("consolidado")} style={{ background: "none", border: "none", color: C.textLo, cursor: "pointer", fontSize: 12, marginBottom: 8, fontFamily: "inherit" }}>← Volver a vista consolidada</button>
        <h2 style={{ fontSize: 22, color: C.textHi, marginBottom: 4, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {p.icono} {p.nombre}
          <BtnIcon variant="edit" onClick={() => openModal("edit-proyecto-meta", { proyectoId: p.id })} style={{ fontSize: 13 }}>✏️ Editar info</BtnIcon>
        </h2>
        <Meta>
          <span><strong style={{ color: C.textMid }}>Cliente:</strong> {p.cliente}</span>
          <span><strong style={{ color: C.textMid }}>PM:</strong> {p.pm}</span>
          <span><strong style={{ color: C.textMid }}>Estado:</strong> {p.estado}</span>
          <span><strong style={{ color: C.textMid }}>Hito próximo:</strong> {p.hitoProximo}</span>
        </Meta>
      </DetailHeader>

      {p.objetivo && (
        <InfoStrip>
          <strong style={{ color: C.purpleLight }}>🎯 Objetivo de la semana:</strong>
          <p>{p.objetivo}</p>
        </InfoStrip>
      )}

      {p.escenarios && p.escenarios.length > 0 && (
        <Block title="⚡ Escenarios de equipamiento" count={`${p.escenarios.length} opciones`}>
          {p.escenarios.map((e, idx) => (
            <div key={idx} style={{ background: C.bg, borderRadius: 8, padding: 14, marginBottom: 10, borderLeft: `3px solid ${C.purple}`, position: "relative" }}>
              <div style={{ position: "absolute", top: 10, right: 10, display: "flex", gap: 4 }}>
                <BtnIcon variant="edit" onClick={() => openModal("edit-escenario", { proyectoId: p.id, idx })}>✏️</BtnIcon>
                <BtnIcon variant="danger" onClick={() => del("escenarios", idx)}>🗑️</BtnIcon>
              </div>
              <h4 style={{ color: C.purpleLight, fontSize: 12, textTransform: "uppercase", marginBottom: 6, letterSpacing: 0.5 }}>{e.titulo}</h4>
              <p style={{ fontSize: 12.5, color: C.textMid, lineHeight: 1.5 }}>{e.desc}</p>
            </div>
          ))}
          <BtnAdd onClick={() => openModal("add-escenario", { proyectoId: p.id })}>+ Agregar escenario</BtnAdd>
        </Block>
      )}

      <Block title="📦 Requerimientos de suministro" count={`${p.requerimientos.length} ítems`}>
        {p.requerimientos.length > 0 && (
          <table style={tStyle}>
            <thead>
              <tr>
                <th style={thStyle}></th>
                <th style={thStyle}>Descripción</th>
                <th style={thStyle}>Origen</th>
                <th style={thStyle}>Necesaria</th>
                <th style={thStyle}>ETA</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Responsable</th>
                <th style={thStyle}>Notas</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {p.requerimientos.map((r, idx) => {
                const sem = r.status === "entregado" ? "green" : r.critico ? "red" : "yellow";
                const accionesAmarradas = p.usaAmarres ? p.pendientes.filter((t) => (t.amarradoA || []).some((a) => a.tipo === "requerimiento" && a.idx === idx)) : [];
                return (
                  <Fragmentish key={idx}>
                    <tr>
                      <td style={tdStyle}><Semaforo kind={sem} /></td>
                      <td style={tdStyle}>
                        <strong style={{ color: C.textHi }}>{r.desc}</strong>
                        {r.critico && r.status !== "entregado" && <Chip variant="critico" style={{ marginLeft: 6 }}>CRÍTICO</Chip>}
                      </td>
                      <td style={tdStyle}><Chip variant={r.tipo === "import" ? "import" : "local"}>{r.tipo === "import" ? "🌎 Import" : "🇭🇳 Local"}</Chip></td>
                      <td style={tdStyle}>{r.necesaria}</td>
                      <td style={tdStyle}>{r.eta}</td>
                      <td style={tdStyle}><Chip variant={r.status}>{r.status.charAt(0).toUpperCase() + r.status.slice(1)}</Chip></td>
                      <td style={tdStyle}>{r.responsable}</td>
                      <td style={{ ...tdStyle, color: C.textLo, fontSize: 11 }}>{r.notas || "—"}</td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                          <BtnIcon variant="edit" onClick={() => openModal("edit-requerimiento", { proyectoId: p.id, idx })}>✏️</BtnIcon>
                          <BtnIcon variant="danger" onClick={() => del("requerimientos", idx)}>🗑️</BtnIcon>
                        </div>
                      </td>
                    </tr>
                    {accionesAmarradas.length > 0 && (
                      <tr>
                        <td></td>
                        <td colSpan={8} style={{ padding: "0 10px 12px 10px", borderBottom: `1px solid ${C.borderSoft}` }}>
                          <AmarresInline items={accionesAmarradas} />
                        </td>
                      </tr>
                    )}
                  </Fragmentish>
                );
              })}
            </tbody>
          </table>
        )}
        <BtnAdd onClick={() => openModal("add-requerimiento", { proyectoId: p.id })}>+ Agregar requerimiento</BtnAdd>
      </Block>

      <Block title="🔧 Recursos / Equipo" count={p.recursos ? p.recursos.length : 0}>
        {p.recursos && p.recursos.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {p.recursos.map((r, idx) => {
              const accionesAmarradas = p.usaAmarres ? p.pendientes.filter((t) => (t.amarradoA || []).some((a) => a.tipo === "recurso" && a.idx === idx)) : [];
              return (
                <div key={idx} style={{ background: C.bg, padding: 12, borderRadius: 8, position: "relative" }}>
                  <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 4 }}>
                    <BtnIcon variant="edit" onClick={() => openModal("edit-recurso", { proyectoId: p.id, idx })}>✏️</BtnIcon>
                    <BtnIcon variant="danger" onClick={() => del("recursos", idx)}>🗑️</BtnIcon>
                  </div>
                  <div style={{ fontSize: 9, textTransform: "uppercase", color: C.textDim, letterSpacing: 0.5, marginBottom: 4 }}>{r.tipo}</div>
                  <div style={{ fontSize: 13, color: C.textHi, fontWeight: 600 }}>{r.nombre}</div>
                  <div style={{ fontSize: 11, color: C.textLo, marginTop: 3 }}>{r.sub}</div>
                  {p.usaAmarres && r.estado && <EstadoBadge estado={r.estado} />}
                  {accionesAmarradas.length > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.card}` }}>
                      <div style={{ fontSize: 9, textTransform: "uppercase", color: C.purpleLight, letterSpacing: 0.5, marginBottom: 6, fontWeight: 600 }}>📌 {accionesAmarradas.length} acción{accionesAmarradas.length > 1 ? "es" : ""} amarrada{accionesAmarradas.length > 1 ? "s" : ""}</div>
                      {accionesAmarradas.map((t, i) => (
                        <div key={i} style={{ fontSize: 11, color: t.hecho ? C.textDim : C.textMid, padding: "4px 0", textDecoration: t.hecho ? "line-through" : "none" }}>
                          {t.prioridad === "red" ? "🔴" : t.prioridad === "yellow" ? "🟡" : "⚪"} {t.desc}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <BtnAdd onClick={() => openModal("add-recurso", { proyectoId: p.id })}>+ Agregar recurso</BtnAdd>
      </Block>

      <Block title="🔴 Riesgos del proyecto" count={p.riesgos?.length || 0}>
        {(!p.riesgos || p.riesgos.length === 0) ? (
          <p style={{ color: C.textDim, fontSize: 12, fontStyle: "italic", padding: "6px 0" }}>Sin riesgos identificados. Pensá: ¿qué te quita el sueño de este proyecto?</p>
        ) : (
          p.riesgos.map((r, idx) => {
            const nivel = NIVEL_RIESGO_MAP[r.nivel] || NIVEL_RIESGO_MAP.medio;
            return (
              <div key={idx} style={{ background: C.bg, borderRadius: 8, padding: "11px 14px", marginBottom: 7, display: "flex", alignItems: "flex-start", gap: 11, borderLeft: `3px solid ${nivel.color}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, color: C.text }}>
                    <strong style={{ color: nivel.color }}>{nivel.emoji} {nivel.label}</strong> · {r.desc}
                  </div>
                  {r.mitigacion && (
                    <div style={{ fontSize: 11, color: C.textLo, marginTop: 6, padding: "6px 10px", background: "rgba(16,185,129,0.08)", borderLeft: `3px solid ${C.green}`, borderRadius: 4 }}>
                      <strong style={{ color: C.greenLight }}>Plan B:</strong> {r.mitigacion}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <BtnIcon variant="edit" onClick={() => openModal("edit-riesgo", { proyectoId: p.id, idx })}>✏️</BtnIcon>
                  <BtnIcon variant="danger" onClick={() => del("riesgos", idx)}>🗑️</BtnIcon>
                </div>
              </div>
            );
          })
        )}
        <BtnAdd onClick={() => openModal("add-riesgo", { proyectoId: p.id })}>+ Agregar riesgo</BtnAdd>
      </Block>

      <Block title="📞 Contactos del proyecto" count={p.contactos?.length || 0}>
        {(!p.contactos || p.contactos.length === 0) ? (
          <p style={{ color: C.textDim, fontSize: 12, fontStyle: "italic", padding: "6px 0" }}>Sin contactos cargados. Cuando estés en obra y se te muera algo, no querés andar buscando teléfonos en WhatsApp.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
            {p.contactos.map((c, idx) => (
              <div key={idx} style={{ background: C.bg, padding: "12px 14px", borderRadius: 8, borderLeft: `3px solid ${C.green}`, position: "relative" }}>
                <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 4 }}>
                  <BtnIcon variant="edit" onClick={() => openModal("edit-contacto", { proyectoId: p.id, idx })}>✏️</BtnIcon>
                  <BtnIcon variant="danger" onClick={() => del("contactos", idx)}>🗑️</BtnIcon>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.textHi, marginBottom: 2, paddingRight: 50 }}>{c.nombre}</div>
                <div style={{ fontSize: 11, color: C.greenLight, marginBottom: 6 }}>{c.rol || "—"}</div>
                {c.telefono && <a href={`tel:${c.telefono}`} style={{ fontSize: 12, color: C.blueLight, textDecoration: "none" }}>📞 {c.telefono}</a>}
                {c.notas && <div style={{ fontSize: 11, color: C.textLo, marginTop: 6 }}>{c.notas}</div>}
              </div>
            ))}
          </div>
        )}
        <BtnAdd onClick={() => openModal("add-contacto", { proyectoId: p.id })}>+ Agregar contacto</BtnAdd>
      </Block>

      <Block
        title={p.usaAmarres ? "⚡ Acciones por coordinar" : "✅ Mis pendientes"}
        count={`${p.pendientes.filter((t) => !t.hecho).length} abiertos / ${p.pendientes.length} totales`}
      >
        {p.pendientes.map((t, idx) => {
          const fav = esFavorito(idx);
          return (
            <div key={idx} style={{ background: C.bg, borderRadius: 8, padding: "11px 14px", marginBottom: 7, display: "flex", alignItems: "flex-start", gap: 11, borderLeft: `3px solid ${t.prioridad === "red" ? C.red : t.prioridad === "yellow" ? C.yellow : C.border}`, opacity: t.hecho ? 0.5 : 1 }}>
              <input type="checkbox" checked={!!t.hecho} onChange={() => togglePendiente(idx)} style={{ marginTop: 3, width: 16, height: 16, cursor: "pointer", accentColor: C.accent }} />
              <BtnIcon onClick={() => toggleEstrella(idx)} title={fav ? "Quitar de Mi día" : "Agregar a Mi día"} style={{ background: fav ? C.accent : "transparent", color: fav ? "white" : undefined, borderColor: fav ? C.accent : undefined }}>{fav ? "⭐" : "☆"}</BtnIcon>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, color: t.hecho ? C.textDim : C.text, marginBottom: 4, textDecoration: t.hecho ? "line-through" : "none" }}>{t.desc}</div>
                <div style={{ fontSize: 10.5, color: C.textDim, display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span><strong style={{ color: C.textLo }}>👤</strong> {t.responsable}</span>
                  <span><strong style={{ color: C.textLo }}>📅</strong> {t.vence}</span>
                  {t.prioridad === "red" && <span style={{ color: C.redLight }}><strong>⚠ URGENTE</strong></span>}
                </div>
                {p.usaAmarres && t.amarradoA && t.amarradoA.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <span style={{ fontSize: 9, textTransform: "uppercase", color: C.textDim, letterSpacing: 0.5, marginRight: 6 }}>Amarrado a:</span>
                    {t.amarradoA.map((a, i) => {
                      if (a.tipo === "recurso" && p.recursos[a.idx]) {
                        return <span key={i} style={{ display: "inline-block", background: "rgba(139,92,246,0.15)", color: C.purpleLight, padding: "2px 8px", borderRadius: 10, fontSize: 10, marginRight: 4, marginTop: 4 }}>🔧 {p.recursos[a.idx].nombre}</span>;
                      }
                      if (a.tipo === "requerimiento" && p.requerimientos[a.idx]) {
                        return <span key={i} style={{ display: "inline-block", background: "rgba(217,119,6,0.15)", color: C.accentLight, padding: "2px 8px", borderRadius: 10, fontSize: 10, marginRight: 4, marginTop: 4 }}>📦 {p.requerimientos[a.idx].desc}</span>;
                      }
                      return null;
                    })}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <BtnIcon variant="edit" onClick={() => openModal("edit-pendiente", { proyectoId: p.id, idx })}>✏️</BtnIcon>
                <BtnIcon variant="danger" onClick={() => del("pendientes", idx)}>🗑️</BtnIcon>
              </div>
            </div>
          );
        })}
        <BtnAdd onClick={() => openModal("add-pendiente", { proyectoId: p.id })}>+ Agregar {p.usaAmarres ? "acción" : "pendiente"}</BtnAdd>
      </Block>

      <Block title="📌 Notas del proyecto">
        <p style={{ fontSize: 11, color: C.textDim, marginBottom: 10, fontStyle: "italic" }}>Contexto del proyecto que no cabe en otro campo. Lo que necesitás recordar pero no es ni acción ni recurso ni riesgo.</p>
        <textarea
          rows={4}
          value={notasLocal}
          onChange={(e) => setNotasLocal(e.target.value)}
          onBlur={() => setNotas(notasLocal)}
          placeholder="ej: El cliente cambió la fecha de movilización por tercera vez, está nervioso. Edy quiere visitar el 12 may."
          style={{ width: "100%", background: C.bg, border: `1px solid ${C.border}`, color: C.text, padding: "10px 12px", borderRadius: 6, fontSize: 13, fontFamily: "inherit", resize: "vertical", minHeight: 80, boxSizing: "border-box" }}
        />
      </Block>
    </>
  );
}

function PendientesGeneralesView({ data, esFavorito, toggle, toggleEstrella, del, openModal }) {
  const cats = {};
  data.pendientesGenerales.forEach((t, idx) => {
    const cat = t.categoria || "General";
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push({ ...t, idx });
  });
  return (
    <>
      <DetailHeader>
        <h2 style={{ fontSize: 22, color: C.textHi, marginBottom: 4 }}>📋 Pendientes Generales</h2>
        <Meta>
          <span>Pendientes que no están atados a un proyecto específico — construcción interna, contrataciones y gestiones</span>
        </Meta>
      </DetailHeader>
      {Object.keys(cats).map((cat) => {
        const items = cats[cat];
        const abiertos = items.filter((t) => !t.hecho).length;
        return (
          <Block key={cat} title={cat} count={`${abiertos} abiertos / ${items.length} totales`}>
            {items.map((t) => {
              const fav = esFavorito(t.idx);
              return (
                <div key={t.idx} style={{ background: C.bg, borderRadius: 8, padding: "11px 14px", marginBottom: 7, display: "flex", alignItems: "flex-start", gap: 11, borderLeft: `3px solid ${t.prioridad === "red" ? C.red : t.prioridad === "yellow" ? C.yellow : C.border}`, opacity: t.hecho ? 0.5 : 1 }}>
                  <input type="checkbox" checked={!!t.hecho} onChange={() => toggle(t.idx)} style={{ marginTop: 3, width: 16, height: 16, cursor: "pointer", accentColor: C.accent }} />
                  <BtnIcon onClick={() => toggleEstrella(t.idx)} title={fav ? "Quitar de Mi día" : "Agregar a Mi día"} style={{ background: fav ? C.accent : "transparent", color: fav ? "white" : undefined, borderColor: fav ? C.accent : undefined }}>{fav ? "⭐" : "☆"}</BtnIcon>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, color: t.hecho ? C.textDim : C.text, marginBottom: 4, textDecoration: t.hecho ? "line-through" : "none" }}>{t.desc}</div>
                    <div style={{ fontSize: 10.5, color: C.textDim, display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <span><strong style={{ color: C.textLo }}>👤</strong> {t.responsable}</span>
                      <span><strong style={{ color: C.textLo }}>📅</strong> {t.vence}</span>
                      {t.prioridad === "red" && <span style={{ color: C.redLight }}><strong>⚠ URGENTE</strong></span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <BtnIcon variant="edit" onClick={() => openModal("edit-general", { idx: t.idx })}>✏️</BtnIcon>
                    <BtnIcon variant="danger" onClick={() => del(t.idx)}>🗑️</BtnIcon>
                  </div>
                </div>
              );
            })}
          </Block>
        );
      })}
      <BtnAdd onClick={() => openModal("add-general", {})}>+ Agregar pendiente general</BtnAdd>
    </>
  );
}

function CapacidadView({ data, capTab, setCapTab, del, openModal }) {
  const seccion = data.capacidad[capTab];
  const esPersonal = capTab === "personal";
  return (
    <>
      <DetailHeader>
        <h2 style={{ fontSize: 22, color: C.textHi, marginBottom: 4 }}>📊 Capacidad de la empresa</h2>
        <Meta>
          <span>Inventario operativo de Geotecnica Soluciones — qué tenés disponible vs qué necesitás</span>
        </Meta>
      </DetailHeader>

      <InfoStrip>
        <strong style={{ color: C.purpleLight }}>🎯 ¿Para qué sirve este dashboard?</strong>
        <p>Acá ves el estado real de máquinas, personal y vehículos de la empresa. Cuando un proyecto pide recursos, mirás acá si los tenés.</p>
      </InfoStrip>

      <div style={{ display: "flex", gap: 6, marginBottom: 18, background: C.card, padding: 6, borderRadius: 10, width: "fit-content", flexWrap: "wrap" }}>
        {[
          { id: "maquinas", label: "🔧 Máquinas" },
          { id: "personal", label: "👥 Personal" },
          { id: "vehiculos", label: "🚚 Vehículos" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setCapTab(t.id)}
            style={{ padding: "9px 18px", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", background: capTab === t.id ? C.accent : "transparent", color: capTab === t.id ? "white" : C.textLo }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {seccion.map((cat, catIdx) => (
        <Block key={catIdx} title={cat.categoria} count={`${cat.items.length} items`}>
          <table style={tStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Nombre</th>
                {esPersonal && <th style={thStyle}>Rol</th>}
                <th style={thStyle}>Estado</th>
                {!esPersonal && <th style={thStyle}>Asignación</th>}
                <th style={thStyle}>Notas</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {cat.items.map((item, itemIdx) => (
                <tr key={itemIdx}>
                  <td style={tdStyle}><strong style={{ color: C.textHi }}>{item.nombre}</strong></td>
                  {esPersonal && <td style={tdStyle}>{item.rol || "—"}</td>}
                  <td style={tdStyle}>{item.estado || "—"}</td>
                  {!esPersonal && <td style={{ ...tdStyle, fontSize: 11 }}>{item.asignacion || "—"}</td>}
                  <td style={{ ...tdStyle, color: C.textLo, fontSize: 11 }}>{item.notas || "—"}</td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      <BtnIcon variant="edit" onClick={() => openModal("edit-cap-item", { seccion: capTab, catIdx, itemIdx })}>✏️</BtnIcon>
                      <BtnIcon variant="danger" onClick={() => del(capTab, catIdx, itemIdx)}>🗑️</BtnIcon>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <BtnAdd onClick={() => openModal("add-cap-item", { seccion: capTab, catIdx })}>+ Agregar a {cat.categoria}</BtnAdd>
        </Block>
      ))}

      <BtnAdd onClick={() => openModal("add-cap-categoria", { seccion: capTab })} style={{ background: "rgba(139,92,246,0.15)", borderColor: C.purple, color: C.purpleLight }}>+ Agregar nueva categoría</BtnAdd>
    </>
  );
}

// ============ MODALES ============
function ModalShell({ children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 12, padding: 24, maxWidth: 600, width: "100%", maxHeight: "90vh", overflowY: "auto", border: `2px solid ${C.accent}` }}>
        {children}
      </div>
    </div>
  );
}

function ModalForm({ modal, updateDraft, data, onSave, onClose }) {
  const { kind, params, draft } = modal;
  const findP = (id) => data.proyectos.find((x) => x.id === id);

  const Field = ({ label, children }) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 11, color: C.textLo, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );

  const Title = ({ children }) => (
    <h3 style={{ color: C.accent, fontSize: 16, marginBottom: 16, textTransform: "uppercase", letterSpacing: 1 }}>{children}</h3>
  );

  const Actions = ({ saveLabel = "Guardar" }) => (
    <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
      <button onClick={onClose} style={{ ...modalBtn, background: C.border, color: C.textMid }}>Cancelar</button>
      <button onClick={onSave} style={{ ...modalBtn, background: C.accent, color: "white" }}>{saveLabel}</button>
    </div>
  );

  const renderAmarresChecklist = () => {
    const p = findP(params.proyectoId);
    if (!p || !p.usaAmarres) return null;
    const isChecked = (tipo, idx) => (draft.amarradoA || []).some((a) => a.tipo === tipo && a.idx === idx);
    const toggleAmarre = (tipo, idx) => {
      const cur = draft.amarradoA || [];
      const i = cur.findIndex((a) => a.tipo === tipo && a.idx === idx);
      const next = i >= 0 ? cur.filter((_, n) => n !== i) : [...cur, { tipo, idx }];
      updateDraft({ amarradoA: next });
    };
    return (
      <Field label="🔗 Amarrar a (opcional)">
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10, maxHeight: 200, overflowY: "auto" }}>
          {p.recursos && p.recursos.length > 0 && (
            <>
              <div style={{ fontSize: 10, textTransform: "uppercase", color: C.purpleLight, letterSpacing: 0.5, marginBottom: 6, fontWeight: 600 }}>🔧 Recursos / Equipo</div>
              {p.recursos.map((r, idx) => (
                <label key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: "pointer", fontSize: 12, color: C.textMid }}>
                  <input type="checkbox" checked={isChecked("recurso", idx)} onChange={() => toggleAmarre("recurso", idx)} style={{ cursor: "pointer", accentColor: C.accent }} />
                  <span>{r.nombre} <span style={{ color: C.textDim, fontSize: 10 }}>({r.tipo})</span></span>
                </label>
              ))}
            </>
          )}
          {p.requerimientos && p.requerimientos.length > 0 && (
            <>
              <div style={{ fontSize: 10, textTransform: "uppercase", color: C.accentLight, letterSpacing: 0.5, margin: "10px 0 6px 0", fontWeight: 600 }}>📦 Requerimientos de suministro</div>
              {p.requerimientos.map((r, idx) => (
                <label key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: "pointer", fontSize: 12, color: C.textMid }}>
                  <input type="checkbox" checked={isChecked("requerimiento", idx)} onChange={() => toggleAmarre("requerimiento", idx)} style={{ cursor: "pointer", accentColor: C.accent }} />
                  <span>{r.desc}</span>
                </label>
              ))}
            </>
          )}
        </div>
      </Field>
    );
  };

  // === Render según tipo ===
  if (kind === "edit-proyecto-meta") {
    return (
      <>
        <Title>✏️ Editar información del proyecto</Title>
        <Field label="Nombre"><input style={inp} value={draft.nombre} onChange={(e) => updateDraft({ nombre: e.target.value })} /></Field>
        <Field label="Cliente"><input style={inp} value={draft.cliente} onChange={(e) => updateDraft({ cliente: e.target.value })} /></Field>
        <Field label="PM"><input style={inp} value={draft.pm} onChange={(e) => updateDraft({ pm: e.target.value })} /></Field>
        <Field label="Estado"><input style={inp} value={draft.estado} onChange={(e) => updateDraft({ estado: e.target.value })} /></Field>
        <Field label="Hito próximo"><input style={inp} value={draft.hitoProximo} onChange={(e) => updateDraft({ hitoProximo: e.target.value })} /></Field>
        <Field label="Semáforo">
          <select style={inp} value={draft.semaforo} onChange={(e) => updateDraft({ semaforo: e.target.value })}>
            <option value="red">🔴 Crítico</option>
            <option value="yellow">🟡 En riesgo</option>
            <option value="green">🟢 En tiempo</option>
            <option value="gray">⚪ En espera</option>
          </select>
        </Field>
        <Field label="Objetivo de la semana"><textarea style={ta} value={draft.objetivo} onChange={(e) => updateDraft({ objetivo: e.target.value })} /></Field>
        <Actions />
      </>
    );
  }

  if (kind === "add-requerimiento" || kind === "edit-requerimiento") {
    return (
      <>
        <Title>{kind === "add-requerimiento" ? "+ Agregar requerimiento" : "✏️ Editar requerimiento"}</Title>
        <Field label="Descripción"><textarea style={ta} value={draft.desc} onChange={(e) => updateDraft({ desc: e.target.value })} placeholder="¿Qué se necesita?" /></Field>
        <Field label="Origen">
          <select style={inp} value={draft.tipo} onChange={(e) => updateDraft({ tipo: e.target.value })}>
            <option value="local">🇭🇳 Local</option>
            <option value="import">🌎 Importación</option>
          </select>
        </Field>
        <Field label="Fecha necesaria"><input style={inp} value={draft.necesaria} onChange={(e) => updateDraft({ necesaria: e.target.value })} placeholder="ej: 5 May" /></Field>
        <Field label="ETA"><input style={inp} value={draft.eta} onChange={(e) => updateDraft({ eta: e.target.value })} /></Field>
        <Field label="Status">
          <select style={inp} value={draft.status} onChange={(e) => updateDraft({ status: e.target.value })}>
            <option value="pendiente">Pendiente</option>
            <option value="cotizacion">Cotización</option>
            <option value="transito">Tránsito</option>
            <option value="entregado">Entregado</option>
          </select>
        </Field>
        <Field label="Responsable"><input style={inp} value={draft.responsable} onChange={(e) => updateDraft({ responsable: e.target.value })} /></Field>
        <Field label="Notas"><textarea style={ta} value={draft.notas || ""} onChange={(e) => updateDraft({ notas: e.target.value })} /></Field>
        <Field label="">
          <label style={{ display: "flex", alignItems: "center", gap: 8, color: C.text, fontSize: 13 }}>
            <input type="checkbox" checked={!!draft.critico} onChange={(e) => updateDraft({ critico: e.target.checked })} style={{ accentColor: C.accent }} />
            Marcar como CRÍTICO
          </label>
        </Field>
        <Actions saveLabel={kind === "add-requerimiento" ? "Agregar" : "Guardar"} />
      </>
    );
  }

  if (kind === "add-recurso" || kind === "edit-recurso") {
    const p = findP(params.proyectoId);
    return (
      <>
        <Title>{kind === "add-recurso" ? "+ Agregar recurso" : "✏️ Editar recurso"}</Title>
        <Field label="Tipo (etiqueta)"><input style={inp} value={draft.tipo} onChange={(e) => updateDraft({ tipo: e.target.value })} placeholder="ej: Equipo a movilizar" /></Field>
        <Field label="Nombre"><input style={inp} value={draft.nombre} onChange={(e) => updateDraft({ nombre: e.target.value })} placeholder="ej: Pilotadora Bauer" /></Field>
        <Field label="Detalle"><textarea style={ta} value={draft.sub} onChange={(e) => updateDraft({ sub: e.target.value })} placeholder="ej: Asignada desde 10 Mar" /></Field>
        {p && p.usaAmarres && (
          <Field label="Estado">
            <select style={inp} value={draft.estado || "por-movilizar"} onChange={(e) => updateDraft({ estado: e.target.value })}>
              <option value="por-definir">❓ Por definir</option>
              <option value="por-movilizar">🟡 Por movilizar</option>
              <option value="en-transito">🚛 En tránsito</option>
              <option value="en-obra">🟢 En obra</option>
              <option value="operativo">✅ Operativo</option>
              <option value="mantenimiento">🔧 Mantenimiento</option>
            </select>
          </Field>
        )}
        <Actions saveLabel={kind === "add-recurso" ? "Agregar" : "Guardar"} />
      </>
    );
  }

  if (kind === "add-pendiente" || kind === "edit-pendiente") {
    const p = findP(params.proyectoId);
    return (
      <>
        <Title>{kind === "add-pendiente" ? (p?.usaAmarres ? "+ Agregar acción" : "+ Agregar pendiente") : (p?.usaAmarres ? "✏️ Editar acción" : "✏️ Editar pendiente")}</Title>
        <Field label="Descripción"><textarea style={ta} value={draft.desc} onChange={(e) => updateDraft({ desc: e.target.value })} placeholder="¿Qué hay que hacer?" /></Field>
        <Field label="Responsable"><input style={inp} value={draft.responsable} onChange={(e) => updateDraft({ responsable: e.target.value })} /></Field>
        <Field label="Vence"><input style={inp} value={draft.vence} onChange={(e) => updateDraft({ vence: e.target.value })} placeholder="ej: 28 Abr" /></Field>
        <Field label="Prioridad">
          <select style={inp} value={draft.prioridad || ""} onChange={(e) => updateDraft({ prioridad: e.target.value })}>
            <option value="">Normal</option>
            <option value="yellow">🟡 Importante</option>
            <option value="red">🔴 Urgente</option>
          </select>
        </Field>
        {renderAmarresChecklist()}
        <Actions saveLabel={kind === "add-pendiente" ? "Agregar" : "Guardar"} />
      </>
    );
  }

  if (kind === "add-riesgo" || kind === "edit-riesgo") {
    return (
      <>
        <Title>{kind === "add-riesgo" ? "+ Agregar riesgo del proyecto" : "✏️ Editar riesgo"}</Title>
        <Field label="Descripción del riesgo"><textarea style={ta} value={draft.desc} onChange={(e) => updateDraft({ desc: e.target.value })} placeholder="¿Qué te quita el sueño de este proyecto?" /></Field>
        <Field label="Nivel">
          <select style={inp} value={draft.nivel} onChange={(e) => updateDraft({ nivel: e.target.value })}>
            <option value="critico">🔴 Crítico</option>
            <option value="alto">🟠 Alto</option>
            <option value="medio">🟡 Medio</option>
          </select>
        </Field>
        <Field label="Plan de mitigación"><textarea style={ta} value={draft.mitigacion || ""} onChange={(e) => updateDraft({ mitigacion: e.target.value })} placeholder="¿Qué hacés si pasa? Plan B" /></Field>
        <Actions saveLabel={kind === "add-riesgo" ? "Agregar" : "Guardar"} />
      </>
    );
  }

  if (kind === "add-contacto" || kind === "edit-contacto") {
    return (
      <>
        <Title>{kind === "add-contacto" ? "+ Agregar contacto del proyecto" : "✏️ Editar contacto"}</Title>
        <Field label="Nombre"><input style={inp} value={draft.nombre} onChange={(e) => updateDraft({ nombre: e.target.value })} placeholder="ej: Ing. Juan Pérez" /></Field>
        <Field label="Rol"><input style={inp} value={draft.rol || ""} onChange={(e) => updateDraft({ rol: e.target.value })} placeholder="ej: Cliente, Residente, Proveedor" /></Field>
        <Field label="Teléfono"><input style={inp} value={draft.telefono || ""} onChange={(e) => updateDraft({ telefono: e.target.value })} placeholder="ej: +504 9999-9999" /></Field>
        <Field label="Notas"><textarea style={ta} value={draft.notas || ""} onChange={(e) => updateDraft({ notas: e.target.value })} /></Field>
        <Actions saveLabel={kind === "add-contacto" ? "Agregar" : "Guardar"} />
      </>
    );
  }

  if (kind === "add-escenario" || kind === "edit-escenario") {
    return (
      <>
        <Title>{kind === "add-escenario" ? "+ Agregar escenario" : "✏️ Editar escenario"}</Title>
        <Field label="Título"><input style={inp} value={draft.titulo} onChange={(e) => updateDraft({ titulo: e.target.value })} placeholder="ej: Escenario C — usar X equipo" /></Field>
        <Field label="Descripción"><textarea style={ta} value={draft.desc} onChange={(e) => updateDraft({ desc: e.target.value })} placeholder="Describí qué implica este escenario..." /></Field>
        <Actions saveLabel={kind === "add-escenario" ? "Agregar" : "Guardar"} />
      </>
    );
  }

  if (kind === "add-general" || kind === "edit-general") {
    return (
      <>
        <Title>{kind === "add-general" ? "+ Agregar pendiente general" : "✏️ Editar pendiente general"}</Title>
        <Field label="Descripción"><textarea style={ta} value={draft.desc} onChange={(e) => updateDraft({ desc: e.target.value })} /></Field>
        <Field label="Responsable"><input style={inp} value={draft.responsable} onChange={(e) => updateDraft({ responsable: e.target.value })} /></Field>
        <Field label="Vence"><input style={inp} value={draft.vence} onChange={(e) => updateDraft({ vence: e.target.value })} placeholder="ej: Esta semana" /></Field>
        <Field label="Categoría"><input style={inp} value={draft.categoria || ""} onChange={(e) => updateDraft({ categoria: e.target.value })} placeholder="ej: Contrataciones, Construcción interna, Gestión" /></Field>
        <Field label="Prioridad">
          <select style={inp} value={draft.prioridad || ""} onChange={(e) => updateDraft({ prioridad: e.target.value })}>
            <option value="">Normal</option>
            <option value="yellow">🟡 Importante</option>
            <option value="red">🔴 Urgente</option>
          </select>
        </Field>
        <Actions saveLabel={kind === "add-general" ? "Agregar" : "Guardar"} />
      </>
    );
  }

  if (kind === "add-cap-item" || kind === "edit-cap-item") {
    const esPersonal = params.seccion === "personal";
    return (
      <>
        <Title>{kind === "add-cap-item" ? `+ Agregar ${esPersonal ? "persona" : "item"}` : `✏️ Editar ${esPersonal ? "persona" : "item"}`}</Title>
        <Field label="Nombre"><input style={inp} value={draft.nombre} onChange={(e) => updateDraft({ nombre: e.target.value })} placeholder={esPersonal ? "ej: Juan Pérez" : "ej: Compresor 500-A"} /></Field>
        {esPersonal && <Field label="Rol"><input style={inp} value={draft.rol || ""} onChange={(e) => updateDraft({ rol: e.target.value })} placeholder="ej: Operador, Ayudante, Motorista" /></Field>}
        <Field label="Estado"><input style={inp} value={draft.estado || ""} onChange={(e) => updateDraft({ estado: e.target.value })} placeholder="ej: En obra, Plantel" /></Field>
        {!esPersonal && <Field label="Asignación"><input style={inp} value={draft.asignacion || ""} onChange={(e) => updateDraft({ asignacion: e.target.value })} placeholder="ej: Amicci" /></Field>}
        <Field label="Notas"><textarea style={ta} value={draft.notas || ""} onChange={(e) => updateDraft({ notas: e.target.value })} /></Field>
        <Actions saveLabel={kind === "add-cap-item" ? "Agregar" : "Guardar"} />
      </>
    );
  }

  if (kind === "add-cap-categoria") {
    return (
      <>
        <Title>+ Agregar nueva categoría</Title>
        <Field label="Nombre de la categoría"><input style={inp} value={draft.nombre} onChange={(e) => updateDraft({ nombre: e.target.value })} placeholder="ej: Pilotadoras grandes" /></Field>
        <Actions saveLabel="Agregar" />
      </>
    );
  }

  return null;
}

// ============ COMPONENTES PEQUEÑOS ============
function DetailHeader({ children }) {
  return (
    <div style={{ background: `linear-gradient(135deg, ${C.card} 0%, ${C.bg} 100%)`, padding: "22px 26px", borderRadius: 12, marginBottom: 18, borderLeft: `5px solid ${C.accent}` }}>
      {children}
    </div>
  );
}

function Meta({ children }) {
  return <div style={{ display: "flex", gap: 18, marginTop: 10, fontSize: 12, color: C.textLo, flexWrap: "wrap" }}>{children}</div>;
}

function Block({ title, count, children, titleColor }) {
  return (
    <div style={{ background: C.card, borderRadius: 10, padding: "18px 22px", marginBottom: 16 }}>
      {title && (
        <h3 style={{ fontSize: 14, color: titleColor || C.accent, marginBottom: 12, textTransform: "uppercase", letterSpacing: 1, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span>{title}</span>
          {count !== undefined && <span style={{ background: C.border, color: C.textMid, fontSize: 11, padding: "3px 10px", borderRadius: 12, fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>{count}</span>}
        </h3>
      )}
      {children}
    </div>
  );
}

function InfoStrip({ children }) {
  return (
    <div style={{ background: "rgba(139,92,246,0.1)", borderLeft: `4px solid ${C.purple}`, padding: "12px 16px", borderRadius: 6, marginBottom: 14 }}>
      {children}
    </div>
  );
}

function Semaforo({ kind }) {
  const colors = { red: C.red, yellow: C.yellow, green: C.green, gray: C.textDim };
  const c = colors[kind] || colors.gray;
  return <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", marginRight: 6, background: c, boxShadow: kind !== "gray" ? `0 0 6px ${c}90` : "none" }} />;
}

function Chip({ variant, children, style }) {
  const map = {
    import: { bg: "rgba(59,130,246,0.15)", color: C.blueLight },
    local: { bg: "rgba(16,185,129,0.15)", color: C.greenLight },
    pendiente: { bg: "rgba(245,158,11,0.15)", color: C.accentLight },
    transito: { bg: "rgba(59,130,246,0.15)", color: C.blueLight },
    entregado: { bg: "rgba(16,185,129,0.15)", color: C.greenLight },
    critico: { bg: "rgba(220,38,38,0.2)", color: C.redLight },
    cotizacion: { bg: "rgba(139,92,246,0.15)", color: C.purpleLight },
  };
  const s = map[variant] || map.pendiente;
  return <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 12, fontSize: 10, fontWeight: 600, background: s.bg, color: s.color, ...style }}>{children}</span>;
}

function EstadoBadge({ estado }) {
  const e = ESTADO_RECURSO_MAP[estado] || ESTADO_RECURSO_MAP["por-definir"];
  return <div style={{ display: "inline-block", background: e.bg, color: e.color, padding: "3px 10px", borderRadius: 12, fontSize: 10, fontWeight: 600, marginTop: 8 }}>{e.label}</div>;
}

function BtnIcon({ children, variant, onClick, title, style }) {
  const [hover, setHover] = useState(false);
  let bg = "transparent", color = C.textLo, border = `1px solid ${C.border}`;
  if (hover) {
    if (variant === "danger") { bg = C.red; color = "white"; border = `1px solid ${C.red}`; }
    else if (variant === "edit") { bg = C.accent; color = "white"; border = `1px solid ${C.accent}`; }
    else { bg = C.border; color = C.textHi; }
  }
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ background: bg, border, color, padding: "5px 9px", borderRadius: 5, cursor: "pointer", fontSize: 12, marginLeft: 0, fontFamily: "inherit", transition: "all 0.15s", userSelect: "none", minWidth: 32, minHeight: 28, ...style }}
    >
      {children}
    </button>
  );
}

function BtnAdd({ children, onClick, style }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ background: hover ? C.accentBgHover : C.accentBg, border: `1px dashed ${C.accent}`, color: C.accentLight, padding: "8px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", marginTop: 10, width: "100%", transition: "all 0.15s", ...style }}
    >
      {children}
    </button>
  );
}

function KpiTop({ color, label, value, foot, onClick }) {
  return (
    <div onClick={onClick} style={{ background: C.card, padding: 18, borderRadius: 10, borderTop: `3px solid ${color}`, cursor: onClick ? "pointer" : "default" }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", color: C.textLo, letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: C.textHi }}>{value}</div>
      <div style={{ fontSize: 11, color, marginTop: 3 }}>{foot}</div>
    </div>
  );
}

function Metric({ label, value, valueColor, small }) {
  return (
    <div style={{ background: C.bg, padding: "9px 12px", borderRadius: 7 }}>
      <div style={{ fontSize: 9, textTransform: "uppercase", color: C.textDim, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: small ? 11 : 14, fontWeight: 700, color: valueColor || C.textHi, marginTop: 3 }}>{value}</div>
    </div>
  );
}

function AmarresInline({ items }) {
  return (
    <div style={{ background: C.bg, borderLeft: `3px solid ${C.purple}`, padding: "8px 12px", borderRadius: 6 }}>
      <div style={{ fontSize: 9, textTransform: "uppercase", color: C.purpleLight, letterSpacing: 0.5, marginBottom: 6, fontWeight: 600 }}>📌 {items.length} acción{items.length > 1 ? "es" : ""} amarrada{items.length > 1 ? "s" : ""}</div>
      {items.map((t, i) => (
        <div key={i} style={{ fontSize: 11, color: t.hecho ? C.textDim : C.textMid, padding: "3px 0", textDecoration: t.hecho ? "line-through" : "none" }}>
          {t.prioridad === "red" ? "🔴" : t.prioridad === "yellow" ? "🟡" : "⚪"} {t.desc} <span style={{ color: C.textDim, fontSize: 10 }}>· {t.responsable} · {t.vence}</span>
        </div>
      ))}
    </div>
  );
}

function Fragmentish({ children }) {
  return <>{children}</>;
}

// ============ ESTILOS COMPARTIDOS ============
const tStyle = { width: "100%", borderCollapse: "collapse" };
const thStyle = { textAlign: "left", padding: "8px 10px", fontSize: 10, textTransform: "uppercase", color: C.textDim, letterSpacing: 0.5, borderBottom: `1px solid ${C.border}`, fontWeight: 600 };
const tdStyle = { padding: "11px 10px", fontSize: 12.5, color: C.textMid, borderBottom: `1px solid ${C.borderSoft}`, verticalAlign: "top" };
const inp = { width: "100%", background: C.bg, border: `1px solid ${C.border}`, color: C.text, padding: "8px 12px", borderRadius: 6, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };
const ta = { ...inp, resize: "vertical", minHeight: 60 };
const modalBtn = { padding: "9px 18px", borderRadius: 6, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const btn = (bg, color, border) => ({ background: bg, border: `1px solid ${border}`, borderRadius: 8, color, padding: "8px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" });
