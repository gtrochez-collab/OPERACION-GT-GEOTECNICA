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
- `LogisticsModule.jsx` (GeoLogistics) — flota y despachos (kanban Oscar/Jorge).
- `SafetyModule.jsx` (GeoSafety) — EPP: catálogo con carrito estilo Amazon
  (requisición indica colaborador de hr-emps5 + motivo primera_vez/perdida/danio),
  inventario, proveedores (Chispa Safety, Larach, La Mundial, Summit, Infra,
  Amazon), Descuentos planilla (pérdidas → deducir, marca "deducido").
  Flujo: pendiente → aprobada → entregada (descuenta stock). Keys: `ep-*`.
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
  auto "1" (descanso pagado). Resumen por proyecto: solo personas asignadas + NSP + INC.
- Costos MO (HR): costo diario = (salario + bonificación) / 30 × días pagados
  (DT×2, DT2/TF×3, INC=1, NSP=0). Reporte PDF/CSV por proyecto/quincena.
- Horas extras: hora base = salario/30/8 (SIN bonificación); 4-7pm +25%,
  7-10pm +50%, 10pm-12am +75%, domingo ×2 todas. PAGO QUINCENA VENCIDA:
  HE de 1Q se pagan fin de mes (2Q); HE de 2Q el 15 del mes siguiente.
  En Costos aparecen en la quincena en que se PAGAN (desembolso).
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
