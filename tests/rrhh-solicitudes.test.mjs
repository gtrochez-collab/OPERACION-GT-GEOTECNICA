import test from "node:test";
import assert from "node:assert/strict";
import {
  puedeDecidir, vincularEmpleado, rangoFechas, diasHabiles, diasCalendario, siguienteFolio,
  validarSolicitud, armarSolicitud, detalleSolicitud, textoConstancia, vacacionDeSolicitud,
  permisosDeSolicitud, diasDeMarcas, resumenAsistencia, quincenasRecientes, vacacionesTomadas,
  puedeDescargarConstancia, puedeCancelar, numeroALetras, lempirasEnLetras, fechaEnLetras, fechaCierreEnLetras, constanciaDoc,
} from "../src/rrhh-solicitudes.js";

const emps = [
  { id: "e1", fullName: "Fernando Antonio Diaz Lopez", status: "active", company: "geotecnica", position: "Coordinador", dni: "0801", startDate: "2024-03-01", salary: 30000 },
  { id: "e2", fullName: "Ana Vasquez", status: "active", company: "geotecnica" },
  { id: "e3", fullName: "Juan Perez", status: "active" },
  { id: "e4", fullName: "Juan Perez Lopez", status: "active" },
  { id: "e5", fullName: "Oscar Paz", status: "inactive" },
];

test("vincularEmpleado: vínculo > sesión > nombre; ambiguo no adivina", () => {
  assert.equal(vincularEmpleado({ username: "fernando", label: "Lic. Fernando Diaz" }, emps).emp?.id, "e1");
  assert.equal(vincularEmpleado({ username: "x", label: "Ana Vasquez" }, emps).como, "nombre");
  assert.equal(vincularEmpleado({ username: "x", label: "Juan Perez" }, emps).emp?.id, "e3"); // exacto gana
  assert.equal(vincularEmpleado({ username: "x", label: "Perez" }, emps).emp, null); // una palabra no basta
  assert.equal(vincularEmpleado({ username: "x", label: "Lopez Perez" }, emps).emp?.id, "e4"); // solo e4 trae las dos
  assert.equal(vincularEmpleado({ username: "x", label: "Juan Lopez" }, emps).emp?.id, "e4");
  assert.equal(vincularEmpleado({ username: "x", label: "Oscar Paz" }, emps).emp?.id, "e5"); // inactivo único
  assert.equal(vincularEmpleado({ username: "ana", label: "Nadie Aqui", empId: "e2" }, emps).como, "sesion");
  assert.equal(vincularEmpleado({ username: "ana", label: "Nadie Aqui" }, emps, { ana: "e1" }).emp?.id, "e1");
  assert.equal(vincularEmpleado({ username: "g", label: "Gerencia" }, emps).emp, null);
});

test("fechas: rango, hábiles (sin domingos ni feriados), calendario", () => {
  assert.deepEqual(rangoFechas("2026-10-30", "2026-11-02"), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  // 1-nov-2026 es domingo
  assert.deepEqual(diasHabiles("2026-10-30", "2026-11-02"), ["2026-10-30", "2026-10-31", "2026-11-02"]);
  // Semana Morazánica 2026: 8, 9, 10 de octubre
  assert.deepEqual(diasHabiles("2026-10-07", "2026-10-12"), ["2026-10-07", "2026-10-12"]);
  assert.equal(diasCalendario("2026-10-07", "2026-10-12"), 6);
  assert.deepEqual(rangoFechas("2026-10-12", "2026-10-07"), []);
});

test("folio correlativo por año", () => {
  assert.equal(siguienteFolio([], 2026), "RH-2026-0001");
  assert.equal(siguienteFolio([{ folio: "RH-2026-0007" }, { folio: "RH-2025-0300" }], 2026), "RH-2026-0008");
});

test("validar: vacaciones cruzadas, permiso sin motivo, reporte corto", () => {
  const vacs = [{ employeeId: "e1", startDate: "2026-11-02", endDate: "2026-11-06", status: "approved" }];
  assert.match(validarSolicitud({ tipo: "vacaciones", empId: "e1", desde: "2026-11-05", hasta: "2026-11-10" }, { vacs }), /se cruzan/);
  assert.equal(validarSolicitud({ tipo: "vacaciones", empId: "e1", desde: "2026-11-09", hasta: "2026-11-10" }, { vacs }), null);
  assert.match(validarSolicitud({ tipo: "vacaciones", empId: "e1", desde: "2026-11-01", hasta: "2026-11-01" }), /domingos/);
  assert.match(validarSolicitud({ tipo: "permiso", empId: "e1", fecha: "2026-11-03", tipoPermiso: "Personal", motivo: "" }), /motivo/);
  assert.equal(validarSolicitud({ tipo: "permiso", empId: "e1", fecha: "2026-11-03", tipoPermiso: "Medico", motivo: "Cita" }), null);
  assert.match(validarSolicitud({ tipo: "reporte", empId: "e1", categoria: "pago", descripcion: "corto" }), /qué pasó/);
  assert.match(validarSolicitud({ tipo: "constancia", empId: "" }), /quién/);
});

test("armar + detalle + registros al aprobar", () => {
  const sol = { tipo: "vacaciones", desde: "2026-11-02", hasta: "2026-11-08", nota: "viaje" };
  const s = armarSolicitud(sol, { emp: emps[0], solicitante: { username: "fernando", nombre: "Fernando" }, ahora: "2026-10-20T10:00:00.000Z" });
  assert.equal(s.dias, 7); assert.equal(s.diasHabiles, 6); assert.equal(s.estado, "pendiente");
  assert.equal(detalleSolicitud(s), "2 nov al 8 nov · 7 días (6 hábiles)");
  const v = vacacionDeSolicitud({ ...s, id: "s1", folio: "RH-2026-0001" }, { id: "v1", aprobadoPor: "Gerson", at: "x" });
  assert.equal(v.days, 7); assert.equal(v.status, "approved"); assert.equal(v.origenSolicitud, "s1");
  const p = armarSolicitud({ tipo: "permiso", fecha: "2026-10-30", hasta: "2026-11-02", tipoPermiso: "Personal", motivo: "Trámite" }, { emp: emps[0], solicitante: { username: "a", nombre: "A" }, ahora: "t" });
  const ls = permisosDeSolicitud({ ...p, id: "s2" }, { idDe: i => `p${i}`, aprobadoPor: "G", at: "t" });
  assert.deepEqual(ls.map(l => l.date), ["2026-10-30", "2026-10-31", "2026-11-02"]);
  assert.equal(detalleSolicitud(p), "30 oct al 2 nov · Personal");
});

test("decidir: solo RRHH, nunca el que la cargó, ingresos no Ana", () => {
  const sol = { estado: "pendiente", tipo: "vacaciones", solicitadoPor: { username: "ana" } };
  assert.equal(puedeDecidir(sol, { rol: "admin", username: "administrador" }).ok, true);
  assert.equal(puedeDecidir(sol, { rol: "asistente_compras", username: "ana" }).ok, false);
  assert.equal(puedeDecidir(sol, { rol: "costos", username: "christian" }).ok, false);
  assert.equal(puedeDecidir({ ...sol, estado: "aprobada" }, { rol: "admin", username: "x" }).ok, false);
  const ing = { estado: "pendiente", tipo: "constancia", tipoConstancia: "trabajo", solicitadoPor: { username: "f" } };
  assert.equal(puedeDecidir(ing, { rol: "asistente_compras", username: "ana" }).ok, false);
  assert.equal(puedeDecidir(ing, { rol: "tesoreria", username: "carolina" }).ok, true);
  assert.equal(puedeCancelar(sol, { username: "ana" }), true);
  assert.equal(puedeCancelar({ ...sol, estado: "en_revision" }, { username: "ana" }), false);
});

test("constancia: números y fechas en letras", () => {
  assert.equal(numeroALetras(25000), "veinticinco mil");
  assert.equal(numeroALetras(2026), "dos mil veintiséis");
  assert.equal(numeroALetras(101), "ciento un"); assert.equal(numeroALetras(100), "cien");
  assert.equal(numeroALetras(54321, { apocope: false }), "cincuenta y cuatro mil trescientos veintiuno");
  assert.equal(lempirasEnLetras(25000), "VEINTICINCO MIL LEMPIRAS EXACTOS (L. 25,000.00)");
  assert.equal(lempirasEnLetras(12500.5), "DOCE MIL QUINIENTOS LEMPIRAS CON 50/100 (L. 12,500.50)");
  assert.equal(fechaEnLetras("2025-07-02"), "dos (02) de julio de dos mil veinticinco (2025)");
  assert.equal(fechaCierreEnLetras("2026-10-07"), "siete (07) días del mes de octubre del año dos mil veintiséis (2026)");
});

test("constancia: doc calcado (Subterra permanente = solo IHSS; Geotecnica permanente = IHSS + RAP)", () => {
  const fer = { fullName: "Fernando Jesús Díaz Fernández", dni: "0801-2002-20394", company: "subterra", position: "Coordinador de Gestión de Máquinas", contractType: "permanent", startDate: "2025-07-02", salary: 25000, sexo: "masculino" };
  const d = constanciaDoc(fer, { tipo: "trabajo", hoy: "2026-10-07" });
  const t1 = d.parrafos[0].map(r => r[0]).join(""), t2 = d.parrafos[1].map(r => r[0]).join("");
  assert.equal(t1, "Por la presente se HACE CONSTAR que el señor FERNANDO JESÚS DÍAZ FERNÁNDEZ, identificado con el número de identidad 0801-2002-20394, labora para la empresa SUBTERRA, S.A. desde el dos (02) de julio de dos mil veinticinco (2025), permaneciendo activo a la fecha.");
  assert.match(t2, /devengando un salario mensual de VEINTICINCO MIL LEMPIRAS EXACTOS \(L\. 25,000\.00\)\. A su salario se le aplica únicamente la deducción de ley correspondiente al Instituto Hondureño de Seguridad Social \(IHSS\), conforme al siguiente detalle:/);
  assert.deepEqual(d.tabla.map(t => [t.label, t.monto]), [["Salario mensual", "L. 25,000.00"], ["(−) IHSS", "L. 595.16"], ["Salario neto mensual", "L. 24,404.84"]]);
  assert.equal(d.cierre.map(r => r[0]).join(""), "Se extiende la presente constancia en la ciudad de Tegucigalpa, M.D.C., a los siete (07) días del mes de octubre del año dos mil veintiséis (2026), para los fines que el interesado estime convenientes.");
  assert.deepEqual(d.firma, ["Lic. Gerson Trochez", "Coordinador de Operaciones", "SUBTERRA, S.A."]);
  const geo = constanciaDoc({ ...fer, company: "geotecnica", salary: 30000 }, { tipo: "trabajo", hoy: "2026-10-07" });
  assert.deepEqual(geo.tabla.map(t => t.monto), ["L. 30,000.00", "L. 595.16", "L. 271.45", "L. 29,133.39"]);
  assert.match(geo.parrafos[1].map(r => r[0]).join(""), /se le aplican las deducciones de ley correspondientes al Instituto .* \(IHSS\) y al Régimen de Aportaciones Privadas \(RAP\)/);
  const lab = constanciaDoc(fer, { tipo: "laboral", hoy: "2026-10-07" });
  assert.equal(lab.tabla, null); assert.doesNotMatch(lab.parrafos[1].map(r => r[0]).join(""), /salario/);
  const s = { tipo: "constancia", tipoConstancia: "trabajo", estado: "aprobada", empId: "e1", resultado: { doc: d } };
  assert.equal(puedeDescargarConstancia(s, { rol: "asistente_compras", empId: "e2" }), false);
  assert.equal(puedeDescargarConstancia(s, { rol: "costos", empId: "e1" }), true);
  assert.equal(puedeDescargarConstancia(s, { rol: "tesoreria" }), true);
});

test("asistencia desde marcajes: primera entrada, última salida, almuerzo, tarde", () => {
  const marks = [
    { id: "m1", empId: "e1", fecha: "2026-10-19", tipo: "entrada", hora: "8:20", min: 500, tarde: true, horarioEntrada: "8:00", explicacion: "Tráfico" },
    { id: "m2", empId: "e1", fecha: "2026-10-19", tipo: "salida", hora: "17:05", min: 1025 },
    { id: "m3", empId: "e1", fecha: "2026-10-20", tipo: "entrada", hora: "7:55", min: 475 },
    { id: "m4", empId: "e2", fecha: "2026-10-20", tipo: "entrada", hora: "7:00", min: 420 },
  ];
  const dias = diasDeMarcas(marks, "e1", { decisiones: [{ markId: "m1", estado: "aprobada" }], hoy: "2026-10-21" });
  assert.equal(dias.length, 2);
  assert.equal(dias[0].fecha, "2026-10-20"); assert.equal(dias[0].sinSalida, true);
  assert.equal(dias[1].minTarde, 5); assert.equal(dias[1].tardeEstado, "aprobada");
  assert.equal(dias[1].horas, 7.75); // 8:20→17:05 = 8.75 − 1 almuerzo
  const r = resumenAsistencia(dias);
  assert.equal(r.dias, 2); assert.equal(r.tardes, 1); assert.equal(r.horas, 7.8); assert.equal(r.sinSalida, 1);
});

test("quincenas recientes y vacaciones tomadas", () => {
  assert.deepEqual(quincenasRecientes("2026-10-20", 3), [{ periodo: "2026-10", quincena: "2Q" }, { periodo: "2026-10", quincena: "1Q" }, { periodo: "2026-09", quincena: "2Q" }]);
  assert.deepEqual(quincenasRecientes("2026-01-05", 2), [{ periodo: "2026-01", quincena: "1Q" }, { periodo: "2025-12", quincena: "2Q" }]);
  const vacs = [{ employeeId: "e1", startDate: "2026-03-02", endDate: "2026-03-06", days: 5, status: "approved" }, { employeeId: "e1", startDate: "2025-12-20", endDate: "2025-12-24", days: 5, status: "approved" }, { employeeId: "e1", startDate: "2026-05-01", endDate: "2026-05-02", days: 2, status: "rejected" }];
  const t = vacacionesTomadas(vacs, "e1", 2026);
  assert.equal(t.lista.length, 2); assert.equal(t.diasAnio, 5);
});
