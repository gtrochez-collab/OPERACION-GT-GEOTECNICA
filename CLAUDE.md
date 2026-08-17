# Sistema de Operaciones — Grupo Geotecnica

App React (Vite) interna para Geotecnica Soluciones / Subterra Honduras.
SPA sin backend propio: datos en Supabase (tabla key-value `app_data`) con
cache localStorage. Deploy automático a GitHub Pages al hacer push a `main`.

## Comandos
- `npm run dev` — dev server (puerto 5173). Usar preview_start con launch.json, no Bash.
- `npm run build` — SIEMPRE compilar antes de commit (es la red de seguridad).
- Deploy: `git push origin main` dispara `.github/workflows/deploy.yml` → gh-pages.
  URL: https://gtrochez-collab.github.io/OPERACION-GT-GEOTECNICA/
- Verificar deploy: `gh run list` + grep del texto nuevo en el bundle publicado.

## ⚠️ Datos de PRODUCCIÓN
`src/supabase.js` tiene credenciales de producción hardcodeadas — el dev local
escribe a la MISMA base que usan los usuarios reales. No crear/guardar datos de
prueba sin limpiarlos después. Verificaciones destructivas: usar períodos dummy
(ej. 2030-01) y borrarlos al terminar vía la propia UI.

## Módulos (src/)
- `App.jsx` — login (usuarios en `users.js`, roles por módulo en array MODULES).
- `PurchasesModule.jsx` (GeoShopping) — compras: Dashboard mensual, Costos,
  Resumen (filtro mes + colapsable + chips entrega), Solicitudes, Proyectos,
  Por coordinar (kanban Ana → logística), Proveedores. Exporta `generateFichaPDF`.
- `MachinesModule.jsx` (GeoMachinery) — espejo de GeoShopping para repuestos
  (coordinador: Fernando). Mismo flujo completo incl. "Cerrar sin logística".
- `HRModule.jsx` (GeoTeam) — Empleados (fotos), Contratos (tabla por urgencia),
  Planilla, Asistencia (cuadrillas → grid 1/0/INC/DT/DT2/TF + override 1*),
  Horas Extras, Costos MO, Dashboard. Bonificaciones oculto (código intacto).
  **Acceso de Ana (`asistente_compras`, ago 2026)**: flag `isAnaRH` + `hideSalary`
  (= isAnaRH||isPhotoOnly). Ve 7 pestañas (ANA_TABS): Empleados (ficha completa
  + foto, SIN salario/bonificación, sin borrar gente), Contratos (crea/renueva
  pero los montos se HEREDAN y su sE no los toca), Vacaciones, Permisos,
  Asistencia, HE (sin overlay de salario base ni "hora:"), Constancias (solo
  Laboral). Sin Dashboard/Planilla/Movimientos/Costos. `hideSalary` gatea TODOS
  los montos: ficha, columna Salario de contratos, ContractForm/PermForm,
  overlay HE y constancia de Ingresos.
  **Vacaciones/permisos → asistencia (automático)**: `marcarEnAsistencia` +
  `syncVacacion`/`syncPermiso` escriben "V" (vacaciones) o "1"/"0" (permiso
  con/sin goce) en `hr-atts2`. Saltan domingos/feriados y días bloqueados por
  alta/baja; pisan solo "" y "1" (nunca 0/INC/DT/DT2/TF); al borrar el registro
  vuelven la celda a "1". ABORTAN si la nube no responde + verify. `initialData`
  RECONCILIA en cada apertura desde `hr-vacs`/`hr-lvs` (fuente de verdad), así
  que un guardado con la hoja abierta no pierde las V.
  **Cuadrillas**: `sCq` (hr-cuad) con merge por company|periodo|quincena contra
  getCloud + rescate + guardia anti-borrado múltiple + verify (antes era write
  full-array: así desapareció la de Subterra 1Q 2026-08 al guardar la de
  Geotecnica 9 s después). Botón **🔧 Reconstruir cuadrilla** en el aviso de
  "Asistencias históricas sin cuadrilla" (la rearma desde los assignments de la
  hoja). Una quincena nueva siembra copiando la cuadrilla más reciente.
- `LogisticsModule.jsx` (GeoLogistics) — flota y despachos (kanban Oscar/Jorge).
- `SafetyModule.jsx` (GeoSafety) — EPP: catálogo con carrito estilo Amazon
  (ítems con foto/tipoEpp/descripción; requisición reparte un ítem entre
  VARIOS colaboradores de hr-emps5 con cant+motivo c/u: primera_vez/perdida/
  danio), inventario, proveedores (Chispa Safety, Larach, La Mundial, Summit,
  Infra, Amazon), Descuentos planilla (pérdidas → deducir, marca "deducido").
  Pestaña **Por comprar (PO)** (`ep-pos`): faltantes de stock → orden de
  compra con PDF agrupado por proveedor (crearPo con merge getCloud; el
  disponible descuenta lo comprometido en otras reqs abiertas). Reqs
  editables por admin (EditReqFormImpl; saveReqEdit merge que respeta estado
  de la nube y resetea deducido si cambia persona/motivo). Ítems con TALLA
  (solo camisa/botas). Dotación agrupada por proyecto según la última
  asistencia de GeoTeam (attAssign, shorts normalizados como resolveShortHR)
  + grupo JORNAL. GeoSafetyScene: paisaje SVG decorativo al pie (BG-20 +
  figuras con EPP).
  Pestaña **Dotación**: KITS POR PUESTO (const PUESTOS) — ingeniero (casco
  blanco+chaleco khaki, sin camisa/botas: no se proveen), operador_dg (casco
  anaranjado+polo negra, SIN guantes), operador_dp (casco anaranjado+camisa
  amarilla+guantes), ayudante/técnico (casco amarillo+camisa anaranjada),
  ayudante_concreto (=ayudante+opcionales látex/KN95/overol), mecánico (casco
  azul+guantes_mecanica), soldador (kit especial: careta/delantal/polainas/
  mangas/capucha — Kevin Hernández y Norman SUB), tornero (carnaza/esmerilar/
  lumbar/orejeras — Moisés SUB), visita (casco verde neón + chaleco azul vía
  chalecoColor, solo esos 2), oficina (sin EPP, excluido de KPIs). Jeans
  default en todos. "Braga de cuello" = tipoEpp `cubrenucas` (solo cambió el
  label). Avatar EppFigure SVG por puesto (color de casco + estilo
  de camisa; tiene=color, falta=punteado). autoPuesto: SEED_PUESTOS por nombre
  (listas DG/DP de Gerson) + keywords de position; override manual en
  `ep-puestos` (selector en la ficha). inferTipo(nombre) resuelve items/líneas
  viejas sin tipoEpp. KPIs solo personal de campo. Keys: `ep-*`.
  **Flujo req → logística (ago 2026)**: estados pendiente→aprobada→envio→
  `logistica`→entregada. "Enviar a logística" (enviarALogistica, idempotente)
  crea despachos en `lg-despachos` (UNO POR PROYECTO, source:"epp",
  sourceEppReqId, campos string obligatorios del form de GeoLogistics) para
  el kanban de Oscar; recogida en oficina administración. LogisticsModule.
  syncEppReq: al marcar entregado/cerrado TODOS los despachos de la req →
  req pasa sola a entregada (guard estado==="logistica"). eliminarReq borra
  también sus despachos. Escape "Marcar enviada (sin logística)".
  Pestaña **Mis pedidos** (residentes Oscar/Christian): sus reqs
  (solicitante===userName) con timeline + chips de despachos; refresh de
  ep-reqs/lg-despachos en window focus.
  **Dotación MANUAL (`ep-dota`, ago 2026)**: {empId:{tipo:{tiene,fecha}}} —
  el tiene/falta se marca A MANO en la ficha (toggle + fecha de recepción
  opcional, input date uncontrolled a propósito); las reqs entregadas ya NO
  marcan dotación, quedan como "Historial de entregas" en la ficha. Saver
  sDota con merge profundo getCloud por persona+tipo.
  Footer créditos "Lic. Gerson & Ing. Nanu · Capitel Group".
  ⚠ Forms (ItemFormImpl/ProvFormImpl) viven a NIVEL DE MÓDULO — definirlos
  dentro del componente causa remount y pérdida de estado al subir fotos.
  CartModal/FichaModal se renderizan como llamada `{CartModal()}`, no JSX.
- `GeoDrillVault.jsx`, `projects.js` (base + helpers), `holidays.js`, `theme.js`.

## Claves de datos (store = supabase.js)
`cp-purchases`, `cp-projects` (proyectos custom — GeoShopping es el dueño; HR
los lee vía resolveShortHR), `cp-providers`, `cp-file-<id>` (archivos),
`mq-purchases`, `mq-machines`, `lg-despachos` (compartido compras/máquinas/
logística; vínculo: `sourcePurchaseId`), `hr-emps5`, `hr-atts2`, `hr-cuad`,
`hr-he` (horas extras), `hr-pays`, `hr-contracts`, etc.

## Convenciones críticas
- **Guardado robusto**: nunca fire-and-forget en datos importantes. Patrón:
  `const ok = await store.set(...)` → si falla, alert + mantener modal abierto.
- **Escrituras full-array SIEMPRE con `store.getCloud`** (ago 2026, así se
  borraban solicitudes de pago de Fernando en GeoMachinery): `store.get` cae
  al cache local en timeout, y el merge contra una foto vieja escribe el
  array SIN lo que otros crearon — y el verify con `store.get` se auto-
  confirma. Regla: pre-fetch y verify con `getCloud`; si la nube no responde
  **abortar** con alert (no guardar). Aplicado en sP de GeoShopping/
  GeoMachinery + guardia si el guardado borraría >1 unidad, mergeById
  (cp-providers/cp-projects/mq-machines, clave `id||short`) y en los
  uploadFicha de GeoShopping/GeoLogistics. En `supabase.js`, el re-sync
  automático (cache local más nuevo) ya no sube el array tal cual: rescata
  las filas de la nube **creadas después** del cache (createdAt/fecha/date)
  — las más viejas que faltan son borrados propios pendientes y no reviven.
- **Grids/forms críticos** (patrón anti-pérdida de HE, jul 2026): los
  componentes definidos DENTRO de un módulo se remontan con cualquier
  re-render del padre (fotos cargando, resize) y pierden el estado local —
  así se guardó vacía una hoja de HE. HorasExtrasGrid usa `heDraftRef`
  y AttendanceGrid usa `attDraftRef` (espejo del estado en un ref del padre,
  restaurado al remontar si dirty; se descarta al cerrar; así se perdió
  también la asistencia de Subterra 30-jul). Guardados de arrays compartidos: merge por unidad
  contra `store.getCloud()` (lectura directa a nube, sin cache) + verify
  releyendo la nube + guardia anti-vaciado con confirm. No usar `store.get`
  para merges (puede devolver cache local viejo y dispara re-syncs).
- **Borrar siempre con confirm()** (las cuadrillas se perdieron una vez por un × sin confirm).
- **Proyectos**: lista unificada base+custom con `resolveShortHR` en HR
  (los shorts de compras GANAN sobre aliases legacy de projects.js — caso PLANTEL).
- **PDF (jsPDF)**: helvetica NO soporta emojis (salen como "&") — texto plano.
  Ficha = "Acta de Entrega y Recepción", 1 página, branding naranja
  #E8762D/carbón/beige + logo `public/brand/logo-color.png` vía BASE_URL.
- Estética app: naranja #E8762D, carbón #2C2A28, beige #FFFBF5/#DBD4C8,
  montos en verde #059669. Español hondureño (voseo) en UI y con el usuario.
- Commits: mensaje en español + `Co-Authored-By: Claude <modelo> <noreply@anthropic.com>`.

## Reglas de negocio clave
- Flujo compra: borrador → validado → pagado (solo Carolina/tesorería; admin+costos
  emergencia) → finalizado (comprobante) → coordinar (Ana/Fernando) → logística →
  entregado → ficha (Jorge) → lista. Máquinas puede "Cerrar sin logística".
- Asistencia: cuadrilla por quincena es la fuente de asignaciones; domingos/feriados
  auto "1" (descanso pagado). Ciclo día regular: ""→1→0→INC→V→"" (V=vacaciones,
  día pagado, teal). Días BLOQUEADOS por alta/baja NO cuentan en totales/costos
  aunque tengan valor guardado (fix Norman 30-jul). Hora de entrada payByHour
  hasta 11:00 (José Miguel). Resumen por proyecto: personas + NSP + INC + VAC.
  PDF: "1" regular sin color; celdas con * llevan el color del proyecto donde
  trabajó ese día; al final "RESUMEN PARA PLANILLA" (NSP/INC/V con días y total).
- Costos MO (HR): costo diario = (salario + bonificación) / 30 × días pagados
  (DT×2, DT2/TF×3, INC=1, NSP=0). Reporte PDF/CSV por proyecto/quincena.
- Horas extras: hora base = salario/30/8 (SIN bonificación); 4-7pm +25%,
  7-10pm +50%, 10pm-12am +75%, domingo ×2 todas. SÁBADO: jornada hasta 11am,
  la 1ª banda (+25%) corre 11am-7pm (grid muestra "11-7"; mult 25/50/75 igual,
  solo domingo es ×2). PAGO QUINCENA VENCIDA: HE de 1Q se pagan fin de mes
  (2Q); HE de 2Q el 15 del mes siguiente. En Costos aparecen en la quincena
  en que se PAGAN (desembolso). Salario base de HE ajustable por colaborador
  (arreglos: cobran HE a salario mínimo, no al real) — mapa global
  `hr-he-salbase` {empId: salario}, overlay "⚙ Salario base de HE" en el grid,
  heHoraBase lo lee (aplica a Costos), marca "*". Se persiste con "Guardar HE"
  (el ajuste vive local en la grid para no remontarla a mitad de edición).
- Dashboard compras: mensual (selector "Mes de análisis"), dona = % gasto del mes
  por proyecto, tabla por pagar (Carolina)/pagado mes, "Suministro pendiente"
  (falta entregar por proyecto / Ana-Fernando sin coordinar / logística sin entregar).

## Usuarios (users.js — passwords en texto plano, deuda técnica conocida)
admin=administrador/1234geo · tesorería=carolina · costos=christian ·
coordinador_maquinas=fernando · asistente_compras=ana · recepcion=jorge
(GeoTeam solo-fotos + fichas) · visor_compras=arturo (solo lectura
GeoShopping+GeoMachinery) · gerencia (solo lectura).

## Pendientes conocidos
- Duplicado de empleado "Junior Josue Zambrano Zambrano" en Subterra
  (DNI 0801-2000-15434 vs 0801-2001-15434) — usuario decide cuál borrar.
- Última planilla/asistencia real: arrancando 2Q julio 2026 (cuadrillas listas,
  hoja HE 1Q 2026-07 creada con distribución copiada de la 2Q).
- Ideas futuras: clock in/out plantel, reasignación por día en grid HE,
  workflow Node 24 en deploy.yml, mover auth a Supabase.
