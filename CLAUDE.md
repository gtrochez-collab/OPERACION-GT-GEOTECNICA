# GeoCore — Sistema de Operaciones de Grupo Geotecnica

**Nombre y marca (15-oct-2026, elegido por Gerson)**: el sistema se llama
**GeoCore** (el núcleo de todos los módulos Geo). Logo = curvas de nivel
naranja/blanco sobre carbón (las del login): `public/brand/geocore/`
(geocore.svg + PNG 180/192/512), `GeoCoreMark`/`GeoCoreSello` en `Logo.jsx`.
Título de pestaña "GeoCore · Grupo Geotecnica", favicon, apple-touch-icon y
`public/manifest.webmanifest` (instalable en el celular). El logo de
Geotecnica (`Logo`) se queda como logo de la EMPRESA.

App React (Vite) interna para Geotecnica Soluciones / Subterra Honduras.
SPA sin backend propio: datos en Supabase (tabla key-value `app_data`) con
cache localStorage. Deploy automático a GitHub Pages al hacer push a `main`.

## Comandos
- `npm run dev` — dev server (puerto 5173). Usar preview_start con launch.json, no Bash.
- `npm run build` — SIEMPRE compilar antes de commit (es la red de seguridad).
- `npm test` — pruebas Node (node:test) de la lógica pura: `tests/geosupply-calc.test.mjs`, `tests/geocost-maq.test.mjs`, `tests/leer-cotizacion.test.mjs`, `tests/geoinventory-calc.test.mjs`, `tests/planilla-calc.test.mjs`, `tests/abonos.test.mjs`, `tests/rrhh-solicitudes.test.mjs`, `tests/geoclock-calc.test.mjs` y `tests/reporte-estilo.test.mjs`.
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
  **Rediseño estético total (31-ago-2026)**: login + pantalla de bienvenida +
  panel de control, estilo "Apple claro" con colores Geotecnica (inspirado en
  el sistema escolar IST que Gerson co-diseñó). SOLO estética: credenciales,
  roles, ruteo, sesión `gt-session` y banner de sync quedaron intactos; los
  módulos internos NO se tocaron. Piezas:
  - `UI_CSS` (template string montado como `<style>` SOLO en login/bienvenida/
    panel — al entrar a un módulo se desmonta, los módulos usan sus estilos
    inline): tokens (--marca carbón, --marca-2 #E8762D, --bg #F9F9F8
    blanco griseito casi blanco — el beige se retiró el 31-ago y el tono se
    aclaró dos veces el 3-sep a pedido de Gerson; el `body` de index.html
    lleva el MISMO valor porque queda expuesto en el fade panel→módulo. La
    paleta del rediseño es blanco/gris/naranja/carbón y las manchas de
    brillo naranja/gris, e0/e1/e2,
    --curva cubic-bezier(.32,.72,0,1)), clases `gt-*`, keyframes solo-`from` +
    `fill-mode: backwards`, manchas de brillo 47s/59s (primos) — desde el
    15-oct-2026 las mueve `src/brillos.js` (iniciado en main.jsx) a ~12
    cuadros/s por los MISMOS keyframes y ease-in-out (clase `gt-brillos-js`
    en <html> apaga la animación CSS, que queda de respaldo): a 60 cuadros/s
    el vidrio se re-desenfocaba en cada cuadro y en PCs Windows se sentía
    laggy; a la vista es idéntico. Pausa con la pestaña oculta. Vidrio
    `--v-fondo-foto`, `prefers-reduced-motion` respetado.
  - `LoginScreen`: **14-sep-2026, reemplazo total del fondo** — Gerson pidió
    el mismo diseño y efecto del sitio público (geotecnica-web.vercel.app,
    obra de Daniel): fondo BLANCO con curvas de nivel (ruido tipo Perlin +
    marching squares, `initCurvasDeNivel`/`ruido2D`/`NIVELES_CURVA` a nivel
    de módulo) dibujadas en un `<canvas>` a pantalla completa; al mover el
    mouse un resplandor naranja (gradiente radial recortado a un círculo)
    recorre las curvas cerca del cursor. SIN fotos (las 2 fotos de obra y el
    Ken Burns se retiraron; `public/brand/login/obra-2.jpg`/`obra-4.jpg`
    quedan en disco por si se reusan en otro lado). Tagline "Ingeniería que
    sostiene. Proyectos que avanzan.", tarjeta `.gt-vidrio` (antes tenía un
    fondo especial `--v-fondo-foto` para verse sobre una foto — ya no hace
    falta, es el vidrio estándar), versículo del día, pista "Mové el cursor
    sobre las curvas de nivel" en el pie (mismo texto que el sitio público).
    `initCurvasDeNivel` respeta `prefiereMenosMovimiento()` (curvas fijas,
    solo reaccionan al mouse sin animación de fondo) y se limpia con
    `IntersectionObserver` + `resize` + listeners de puntero, igual patrón
    que el resto del rediseño. Fuentes nuevas en index.html: Plus Jakarta
    Sans + IBM Plex Mono (Inter y Manrope siguen para los módulos).
  - `WelcomeScreen`: tras login, saludo XL ("Buenos días, Gerson.", hero de
    2.6 s) + `fraseDeHoy()` (FRASES neutras en género, rotan por día) que
    transiciona smooth a 3 tarjetas `.gt-vidrio` — TO-DOS (persisten en
    Supabase `gt-todos-<username>`, best-effort; input deshabilitado mientras
    carga: un add con todos===null pisaba la lista en la nube), BANDEJA
    (**EN BLANCO a propósito, 31-ago**: va a estar amarrada al mail de cada
    usuario; la versión con contadores de cp-purchases/gc-tardies vivió unas
    horas
    — **TO-DOS con tope de 5 (7-sep, "que no crezca la caja")**: pendientes
    primero (sort estable), 5 a la vista y chip "+N ver todos" / "Ver
    menos"; al desplegar la lista SCROLLEA dentro del mismo alto (maxHeight
    = 5 filas), así la tarjeta nunca cambia de tamaño. `addTodo` abre la
    lista para que se vea lo recién agregado. Lo demás del párrafo aplica
    a la BANDEJA: — si se retoma, leer SOLO con `store.getCloud`, NUNCA store.get:
    su re-sync de cache viejo puede ESCRIBIR cp-purchases desde una pantalla
    decorativa) y VERSÍCULO (`VERSICULOS` RVR1960, rota por día). Header:
    tuerquita `MenuUsuario` (popover con Cerrar sesión) + logo a la
    izquierda, "Saltar" a la derecha. Botón "Empezar el día". Se muestra UNA
    vez por login (`gt-welcome-done` en sessionStorage — F5 no la repite);
    el rol "marcaje" (kiosk) la SALTA. ⚠ React 19: no ponerle `precedence`
    al <style> de UI_CSS (lo izaría al <head> para siempre y el CSS se
    filtraría a los módulos).
  - `TituloHero` (FLIP invertido): el bloque del título se renderiza SIEMPRE
    en su posición final y, durante el hero, un transform MEDIDO
    (useLayoutEffect pre-paint) lo centra y agranda; al asentar, transform →
    none con transición y "aterriza". textAlign nunca cambia (animar
    textAlign/padding hacía SALTAR el texto — hallazgo adversarial). Escala
    con TOPE al ancho del viewport (en tablet el 1.4 sacaba el título de
    pantalla). `prefiereMenosMovimiento()` salta ambos heroes; la flag
    `gt-panel-hero-done` se estampa al ARRANCAR (irse a mitad no lo repite);
    los contenedores ocultos usan visibility+inert, NO opacity (un padre con
    opacity<1 apaga el backdrop-filter del vidrio y opacity 0 dejaba
    tarjetas alcanzables con Tab+Enter).
  - **Panel sin scroll (23-oct-2026, "que todo quepa en la pantalla, incluso el
    pie, en el monitor y en la Surface chica")**: header, título, tarjetas y pie
    usan `clamp(..., vh, ...)` en paddings, gaps, ícono, título y descripción
    (`PanelCard`, `PanelControl`), grilla `minmax(300px)` y `minHeight: 100dvh`
    en la raíz (el pie queda abajo). Verificado a 1280×680 y 1368×912: sin
    scroll con 7 módulos.
  - **Entrada a módulos (3-sep)**: `abrirModulo(id)` desvanece el panel
    260 ms (`saliendo` → opacity 0 + scale 1.012 en el root de
    PanelControl) y recién ahí monta el módulo envuelto en
    `conEntrada()` → `<div key={activeModule} className="gt-entra-modulo">`
    con `ENTRADA_CSS` propio (keyframe gtEntraModulo 560 ms; CSS mínimo e
    independiente porque los módulos viejos NO montan GT_CSS). GeoShopping
    además pone la clase en su root REAL (la del wrapper se gasta en el
    "Cargando…"). Con prefers-reduced-motion va directo. El timer vive en
    `salidaRef` y `cancelarSalida()` lo corta en logout/volverBienvenida;
    login() limpia activeModule (ninguna sesión hereda el módulo de la
    anterior); el panel lleva pointerEvents:none mientras se desvanece y
    NO usa scale (el transform en el root hacía saltar los brillos fixed).
    `body` en index.html es #F7F7F5 (= --bg: queda expuesto en el fade). La pantalla "Cargando GeoShopping…"
    usa el fondo del sistema para no parpadear beige.
  - `PanelControl` (componente propio, v2 31-ago): el H1 "Panel de Control"
    nace centrado XL y viaja a su lugar **CADA VEZ que aparece el panel**
    (3-sep, pedido de Gerson: "si entrás a un módulo y volvés ya no hacía la
    transición"): la primera vez por login aguanta 1.5 s y en los regresos
    0.8 s (`primeraVezRef`, la flag `gt-panel-hero-done` solo distingue
    primera vez; login/logout la limpian). Header
    estilo IST: [← `volverBienvenida` (borra gt-welcome-done; oculto para
    marcaje)] [tuerquita MenuUsuario] [logo] + usuario a la derecha.
    `PanelCard` en `.gt-vidrio` con iconos SVG de LÍNEA monocromos
    (`IconoModulo` por id, fallback al emoji de MODULES): cajita gris igual
    para todos, hover pinta cajita+dibujo+flecha de naranja; entrada
    escalonada al asentarse el hero (prop `animar`). Ambas pantallas hacen
    scrollTo(0,0) al montar (el botón "Empezar el día" queda al fondo en
    pantallas chicas y el hero no se veía). Footer con estado de sync.
- `PurchasesModule.jsx` (GeoShopping) — compras: Dashboard mensual, Costos,
  **Supply Chain** (reemplazó al viejo "Resumen" el 24-ago-2026), Solicitudes, Proyectos,
  Por coordinar (bandeja de decisión de Ana → logística), Proveedores. Exporta `generateFichaPDF`.
  **Rediseño estético (31-ago-2026, SOLO presentación)**: el módulo monta
  `<style>{GT_CSS}</style>` de `gt-ui.js` (tokens + clases gt-* compartidos
  con App; ⚠ sin `precedence`) + manchas `.gt-brillo` en el root (sin ellas
  el backdrop-filter del vidrio no difumina nada). Header compacto estilo
  IST (se retiró el hero con CarritoSVG): [← gt-circulo][logo][GeoShopping]
  + usuario + Cerrar sesión. Pestañas SIN emojis. Se quitó el strip de
  título por pestaña ("Dashboard gerencial / N solicitudes" — repetitivo).
  **Dashboard (v4, 1-sep)**: TRES tarjetas compactas `.gt-vidrio` —
  barras "Por proyecto" (pagado carbón + por pagar naranja en grande y
  barras dobles), la dona EN MEDIO, y "Gasto por mes — últimos 6 meses"
  (GLOBAL, barras verticales clickeables: click = ver ese mes; el delta
  compara los 2 últimos meses COMPLETOS — el mes en curso a medias daba
  -99% el día 1). Carga ANIMADA: `dashAnim` (useState + useEffect por
  [sec]) hace crecer barras y dona de 0 a su valor (1.1-1.3s, --curva) al
  entrar a la pestaña — paleta SOLO naranja/carbón/gris. ⚠ El efecto
  depende de `[sec, loaded]`: al entrar desde el panel el módulo muestra
  "Cargando…" y el flip a true pasaba ANTES de que existieran las tarjetas
  (nacían al 100%, "no cargan") — con `loaded` en las deps se re-dispara al
  llegar los datos. Selector Por
  mes / **Global** (dashMonth==="global" es valor mágico, solo lo lee
  renderDashboard; Global incluye pagadas viejas SIN paidAt — por mes
  sigue exigiéndolo). Botón "Reporte ejecutivo PDF — <mes>" en el propio
  Dashboard: la pestaña **Costos se retiró** (31-ago, "es lo mismo";
  renderCostos quedó sin ruteo). Se eliminaron la fila de 7 KPIs, las
  alertas y "Suministro pendiente". ⚠ MAQUINAS en "Por proyecto" (cp,
  códigos MAT-) ≠ el por pagar de GeoMachinery (mq, códigos MAQ-): bases
  distintas, ambas correctas — auditado 31-ago contra la nube; la futura
  "central de costos" las unificará. **Solicitudes**: las 7
  StatCard → UNA tira resumen en vidrio, banner de Carolina sobrio, barra
  de filtros y tabla en `.gt-vidrio`, TreasuryBadge/DeliveryBadge sin
  emoji, ✓ en cotización/comprobante. **3-sep — semáforo de colores**
  (Gerson: "está muy gris triste, juguemos más con los colores"): consts
  C_GRIS/C_VERDE/C_VERDE_2/C_AZUL/C_AMARILLO esparcidas en STATUSES/
  TREASURY/DELIVERY — GRIS = pendiente de pago (validado, Pendiente Lic.
  Carolina), VERDE clarito = pagado (todo verdecito una vez pagada:
  pagado/finalizado/pagada/ficha_adjunta/cerrado), AZUL = recibida por
  Tesorería, AMARILLO = pagado pero falta la ficha (pendiente_entrega,
  entrega_proveedor, recibido). `pendiente_ficha` es una entrada SOLO DE
  DISPLAY: la tabla de Solicitudes la muestra cuando el despacho ya está
  entregado/cerrado y falta la ficha (misma regla que la etapa falta_ficha
  de Supply Chain); el estado guardado sigue siendo pendiente_entrega y su
  label "Pendiente de entrega" (la revisión adversarial cazó que
  relabelar el estado real mentía en las compras que Ana ni coordinó).
  Solo color/bg; labels/order intactos. Solicitudes es la 2ª pestaña. Barra
  de filtros en DOS filas compactas (VER+ORDEN / MES+proyecto+proveedor) y
  tira resumen más baja. ⚠ En renderDashboard las barras son la FUNCIÓN
  `barra()` (no un componente `<Barra/>`: definido dentro del render se
  remontaba en cada flip de dashAnim y nacía ya al 100% sin animar — "el de
  la izquierda no carga"); orden "más nueva/más vieja" SIEMPRE por numeración de código
  (regex sobre `codigo`, fallback createdAt para viejas sin código);
  header con chip de carrito SVG en vez del texto "GeoShopping". La
  lógica (filtros, orden, permisos, modales) quedó INTACTA. Fixes de la revisión adversarial: grid móvil con
  minmax(0,1fr)+minWidth:0 (la tabla nowrap inflaba el track y la pestaña
  entera paneaba); stats.montoPagadoMes clasifica por slice(0,7) UTC
  (getMonth() local corría al mes anterior los pagos del día 1 y el mismo
  número salía distinto que en el Dashboard); subrayado de pestaña con
  inset boxShadow (el marginBottom:-1 se recortaba en el overflow).
  **PRIORIDADES — cola de pago de Tesorería (18-sep-2026, pedido de Gerson)**:
  `renderPrioridades` + `PrioridadAddModal` (a nivel de módulo). Reemplaza el
  Excel gigante que Finanzas le armaba a mano a Carolina cada semana: Finanzas
  agrega ahí las solicitudes YA CARGADAS, las ORDENA por urgencia (↑ ↓ o
  drag&drop en escritorio) y marca las que van con prioridad máxima; Carolina
  paga de arriba hacia abajo mientras tenga fondos. Click en cualquier tarjeta
  → `irASolicitud` lleva a la pestaña Solicitudes con el detalle abierto (limpia
  los filtros para que la fila quede visible detrás del modal). Es la pestaña
  que va ANTES de Solicitudes ("al lado, o antes mejor dicho"); para Carolina es
  la PRIMERA (no tiene Dashboard).
  Key propia **`cp-prioridades`** — NO campos dentro de las solicitudes:
  reordenar no reescribe las 440 filas de cp-purchases ni compite con los pagos
  de Carolina (mismo criterio de ownership que gc-marks/gc-tardies). Shape
  `[{id: <purchaseId>, urgente, addedBy, createdAt}]` y el **ORDEN DEL ARRAY ES
  LA PRIORIDAD** (índice 0 = se paga primero). ⚠ El campo se llama `createdAt`
  a propósito: es el único nombre que mira el re-sync de supabase.js para
  RESCATAR filas ajenas cuando el cache local queda más nuevo que la nube.
  `sPri` guarda con el patrón de siempre: pre-fetch `getCloud` (si la nube no
  responde NO se guarda y se revierte el estado local), RESCATE de lo que otro
  agregó y yo nunca tuve (lo que yo saqué a propósito no revive porque estaba en
  mi lista previa) y verify releyendo la nube. `reordenarVisibles` reordena solo
  las entradas de la empresa activa dejando las de la otra en su posición global
  exacta. Las pagadas caen solas a una tira verde "Ya pagadas" (con botón
  "Quitar pagadas", que también limpia huérfanas de solicitudes borradas).
  Permisos: `canEditPri` = admin/costos/compras_ops/tesoreria; gerencia y visor
  solo miran; Ana y Jorge no ven la pestaña.
  **CUENTAS POR PAGAR (21-sep-2026, pedido de Gerson)**: `renderCxp` +
  `CxpAddModal` (a nivel de módulo), pestaña DESPUÉS de Prioridades. Christian
  le CALENDARIZA los pagos a Tesorería. Dos casos: las compras grandes que el
  proveedor nos dio a **crédito**, y las que simplemente **pueden esperar** y
  no entran en Prioridades. ⚠ Diferencia conceptual con Prioridades: allá el
  ORDEN DEL ARRAY es la cola de urgencia; acá manda la **FECHA** — es un
  calendario, no una cola. Key propia **`cp-cxp`**, shape
  `[{id, fecha: "YYYY-MM-DD", nota, addedBy, createdAt}]`.
  Vista: tira resumen (programadas · total · lo que vence esta semana · las que
  se pasaron de fecha), aviso azul con los **créditos aprobados sin
  calendarizar** y botón para programarlos de una, pills de rango (Todas · Se
  pasaron · Esta semana · Este mes · Más adelante) y la lista **agrupada por
  fecha de pago** con el total de cada día. Lo vencido va en rojo (`C_ROJO`) y
  lo de esta semana en naranja (`C_ULTRA`). Cada tarjeta trae el datepicker
  para reprogramar, un botón **"A prioridades"** (la empuja a la cola urgente y
  navega allá; si ya está, solo navega) y la ✕. Las pagadas caen solas a la
  tira verde con "Quitar pagadas".
  **ABONOS / PLAN DE PAGOS (21-sep-2026, 2ª pasada)**: una entrada de `cp-cxp`
  es **UN PAGO PROGRAMADO, no una solicitud** — `{id (del abono), purchaseId,
  fecha, monto, addedBy, createdAt}`. Una solicitud a "plan de pagos" tiene
  VARIAS entradas (el caso de Gerson: L 800,000 abonados por partes). `id` es
  el id del abono porque `sListaPropia` mergea por `id`: así cada abono viaja
  solo. Helpers `cxpDe(purchaseId)` / `cxpProgramado(purchaseId)`. En el modal,
  una solicitud sigue apareciendo **mientras le falte plata por programar**
  (`resta = amount − yaProgramado`), así el 2º y 3er abono se agregan desde el
  mismo lugar; si es plan de pagos aparece un input de monto (prellenado con lo
  que falta) y NO deja pasarse ni poner 0. La tarjeta muestra "Abono N de M",
  "de X · programado Y · falta Z" y el monto es editable en línea.
  **CONDICIÓN DE PAGO en la solicitud (21-sep-2026)**: campos aditivos
  `condicionPago` ("contado" | "credito", default contado — las viejas sin el
  campo se leen como contado) y `tipoCredito` ("unico" | "plan"). Dos pills
  Contado/Crédito y, dentro de Crédito, dos más: **Un solo pago** / **Plan de
  pagos** (Gerson: "que salga si es 1 solo pago o plan de pago y ya, de ahí que
  ellos programen los pagos en cuentas por pagar"). `fechaPagoAcordada` se
  RETIRÓ del form: la fecha se pone en Cuentas por pagar, no acá.
  **ABONOS — pagos parciales con comprobante (17-oct-2026, pedido de
  Christian)**: una solicitud (normalmente a crédito) se paga por partes y la
  solicitud NO se cierra hasta cubrir el total. Lógica PURA en `src/abonos.js`
  (`tests/abonos.test.mjs`); campo ADITIVO `abonos: [{id, monto, fecha,
  metodo, comprobante {fileId…}, nota, registradoPor, registradoAt, anulado?,
  anuladoPor?, anuladoAt?, motivoAnulacion?}]` en cp-/mq-purchases (aplica a
  GeoShopping y GeoMachinery, es el mismo código). `estadoTrasAbonos` manda el
  estado: con saldo > L 1 (`TOLERANCIA_ABONO`) queda `validado` +
  treasuryStatus `recibida` SIN datos de pago (sigue en Pendientes,
  Prioridades, CxP; NO pasa a Por coordinar/Entregas — decisión: la logística
  arranca al pago completo); al completarse → `finalizado` con fecha, método
  y comprobante del ÚLTIMO abono (`paidAt` medianoche UTC como el pago normal)
  + audit `paid` (lo lee el "!" de Ana) y, si es servicio,
  `cierreServicioAlPagar` (la misma regla que ahora usa PaymentFormImpl).
  UI en DetailView: "➕ Registrar abono" (mismos permisos que Registrar pago:
  Carolina + emergencia admin/costos; con abonos vigentes se APAGAN "Registrar
  pago" completo, "Revertir pago" y la subida del comprobante suelto), panel
  "Abonos" con barra de avance, "Ver comprobante" (visor) y "Anular"
  (Carolina, Gerson y Christian — `canCorregirPagada`; motivo obligatorio;
  queda TACHADO, nunca se borra); "↔ Pasar a abonos" (mismos tres: Christian
  es quien carga los abonos de las compras a crédito) en una pagada SIN abonos: su pago pasa a
  ser el abono 1 con su comprobante (caso MAT-2026-0416 de ECOMETAL, marcada
  pagada completa con solo L 500,000 abonados). Form `AbonoFormImpl` a nivel
  de módulo, modal `abono` (`modo: "convertir"`). El comprobante se sube a su
  propia fila `cp-file-<id>` ANTES de guardar (extractFiles no recorre
  arrays). `sP` RESCATA abonos: si la nube trae abonos/anulaciones que la fila
  local no tiene (`nubeTraeAbonosNuevos`), los une por id (`unirAbonos`,
  anulado pegajoso) y recalcula el estado. Saldo visible: chip "Abonada · N" y
  "falta L X" en la tabla, Prioridades muestra lo que FALTA (Christian manda
  "el saldito" ahí), Dashboard y la tira de Solicitudes suman `porPagarDe`.
  Paquete de cierre: fila "Pagada en abonos" + TODOS los comprobantes ("ABONO
  N DE M"). Pendiente a propósito: GeoCost sigue contando la compra entera
  como comprometida hasta el pago completo (no parte ejecutado/comprometido),
  y los pagos programados de `cp-cxp` no se marcan solos al abonar.
  **CALENDARIO DE PAGO (21-sep-2026)**: `renderCalendario`, pestaña después de
  Cuentas por pagar. Mes en la columna izquierda (~1/4) y el detalle del día a
  la derecha, como lo pidió. Une las DOS fuentes: `cp-cxp` (pagos programados,
  con monto — suman al total del día) y `cp-prioridades` con `fechaRequerida`
  (fecha TOPE, un compromiso, no un pago: van aparte y NO suman). Cada día
  lleva puntito naranja (pago), rojo (se pasó) o gris (fecha tope); hoy va con
  borde naranja. Cada fila dice **quién lo programó / quién lo priorizó**.
  Estados `calMes` / `calDia` inicializados en `hoyISO()` (23-sep-2026: "que
  al entrar ya te cargue las del día de hoy" — arranca en el mes Y el día de
  hoy, con el detalle de la derecha ya abierto).
  **FECHA REQUERIDA + "Va a" en la solicitud (25-sep-2026, pedido de
  Finanzas)**: campos aditivos `fechaPagoRequerida` (YYYY-MM-DD, OPCIONAL
  desde el 29-sep-2026 — antes era obligatoria para aprobar; sin fecha no sale
  en el Calendario, y si va a CxP se programa para hoy) y `destinoPago` ("normal" | "prioridad" | "cxp"; sin elegir:
  crédito → cxp, si no normal). TODAS entran al Calendario de Pago. Al
  APROBAR, `encolarPago(saved)` (a nivel del módulo, se pasa como prop a
  PurchaseFormImpl) la agrega SOLA: prioridad → al final de `cp-prioridades`
  con `fechaRequerida`; cxp → UN pago por el total en esa fecha en `cp-cxp`
  (si ya tiene uno, solo le mueve la fecha; si ya tiene varios abonos, no la
  toca). Idempotente, vía `sPri`/`sCxp` (sListaPropia). Normal no escribe
  nada: `renderCalendario` la lee directo (chip gris "Pago requerido", "la
  pidió <responsable>") salvo que ya esté en Prioridades con fecha o en CxP.
  **Volver a la pestaña de origen (25-sep-2026, pedido de la Lic.
  Carolina)**: `irASolicitud` guarda en `volverARef` la pestaña desde donde
  se abrió (Prioridades, Cuentas por pagar o Calendario) y un effect sobre
  `modal` regresa ahí al CERRARSE el modal — incluso después de registrar el
  pago desde el detalle.
  **QUIÉN lo agregó (21-sep-2026)**: las tarjetas de Prioridades muestran "la
  priorizó <fulano>" y las de Cuentas por pagar "programó <fulano>", leyendo el
  `addedBy` que ya se guardaba.
  **FECHA DE PAGO REQUERIDA en Prioridades (21-sep-2026)**: campo aditivo
  `fechaRequerida` en las entradas de `cp-prioridades`, con datepicker en cada
  tarjeta y un chip que dice cuánto falta ("En 2 días" gris/ámbar · "Pagar hoy"
  naranja · "Se pasó N días" rojo). Se compara como STRING YYYY-MM-DD contra
  hoy LOCAL — `new Date` sobre una fecha pura es medianoche UTC y en Honduras
  corría un día.
  ⚠ `sPri` y `sCxp` comparten **`sListaPropia({key, next, previa, ...})`**: el
  guardado robusto de las listas propias de GeoShopping (pre-fetch `getCloud`,
  rescate de lo ajeno, verify) vive en UN solo lugar — si se agrega otra lista
  de este tipo, reusarlo.
  **VENCIDA — +2 semanas sin pago (18-sep-2026)**: `estaVencida(p)` /
  `diasEsperandoPago(p)` / `DIAS_VENCIDA = 14` a nivel de módulo. El reloj corre
  desde la FECHA DE CARGA (`createdAt`) — la misma columna que la tabla muestra
  al lado, así los días siempre cuadran con lo que se ve — y compara SOLO fechas
  (los timestamps mezclan medianoche UTC con hora local y cruzaban el umbral un
  día antes). ⚠ **NO usar `validatedAt`**: ese campo se REESCRIBE cada vez que
  alguien le da "Aprobar y enviar a Tesorería" (por ejemplo al editar la
  solicitud), así que re-aprobar reiniciaba el reloj y ESCONDÍA el atraso. Lo
  cazó Gerson el mismo 18-sep: la MAT-2026-0385 (Ebenezer) se cargó el 2-sep
  igual que sus vecinas pero se re-aprobó el 9-sep, y era la única de esa fecha
  que no salía vencida. Pinta de **rojo clarito** (`C_ROJO`) la fila
  en Solicitudes con el chip "Vencida · N d" y la tarjeta en Prioridades; el
  contador "vencidas" solo aparece en la tira resumen si hay alguna. El
  **naranja clarito** (`C_ULTRA`) es "Urgente", que lo marca Finanzas a mano. Si
  una es las dos, el fondo va ROJO (es un hecho, no una decisión) y se muestran
  los dos chips.
  **Proyectos en orden ALFABÉTICO (18-sep-2026)**: `getAllProjects()` ordena por
  `short` con `localeCompare("es", {sensitivity:"base", numeric:true})` — se
  ordena en la FUENTE, así sale igual en el form de solicitud, en el filtro de
  Solicitudes y en la pestaña Proyectos (los acentos ya no mandan CIMENTACIÓN al
  final).
  **Corregir una compra YA PAGADA (18-sep-2026)**: `CorreccionFormImpl` + modal
  `corregir` + botón en DetailView. SOLO Gerson y Christian
  (`canCorregirPagada = isAdmin || userRole === "costos"` — se compara el rol
  CRUDO porque `isCostos` incluye a Arturo). Cambia únicamente **proyecto** y
  **partida** (con el mismo Select de GeoCost, disponible y justificación de
  sobregiro) + motivo obligatorio; el estado, el pago, la fecha y el comprobante
  de Carolina quedan intactos. ⚠ A propósito NO reusa `PurchaseFormImpl`: sus
  dos botones fuerzan `status: "borrador"/"validado"` y resetean
  `treasuryStatus`, así que editar con él una compra pagada le BORRABA el pago a
  Carolina. El audit se escribe con la acción `partida_reclasificada`, la misma
  que `sP` RESCATA de la nube antes de mergear.
  **POR COORDINAR — bandeja de decisión (21-sep-2026)** — Gerson: "qué relajo
  visual". El "kanban" no era un kanban: de las 4 sub-secciones quedó SOLO
  `por_coordinar` (las otras tres viven en sus pestañas), así que eran 60
  tarjetas TODAS en el mismo estado repartidas en 14 columnas con scroll
  horizontal, cada una repitiendo los mismos 4 botones grandes (~240 botones).
  Y un kanban sin etapas no tiene a dónde arrastrar: al elegir la salida la
  compra SE VA del tablero. Ahora es una **bandeja**: una sola columna,
  **AGRUPADA POR PROYECTO** (pedido explícito: "visualizar en orden por
  proyecto cada pago que hace la Lic. Carolina"), con los proyectos ordenados
  por su compra MÁS VIEJA y, dentro de cada uno, la que más lleva esperando
  primero. Toggle `coordVista` **Por proyecto** (default) / **Lo que más
  espera** (cola plana). Tarjeta compacta: código · "pagada hace N d" (naranja
  a los +7) · proveedor · qué se compró (2 líneas) · monto, y las **3 salidas
  como botones chicos** — Logística (naranja, la principal) · Proveedor (azul)
  · Sin ficha (ghost). Teléfono del proveedor, "Ficha de entrega", "Ver
  solicitud" y las acciones solo-Gerson (cerrar rezagada / borrar) quedan como
  enlaces discretos: se usan poco y competían con la decisión. Filtros:
  buscador + pills de mes de pago. La tira resumen lleva accesos directos a
  "con el proveedor →" y "por cerrar contable →" (los StatCards viejos). **Se
  retiró el banner amarillo del Flujo** (Gerson: "ese texto es innecesario").
  `clasificar()` quedó INTACTA. Estados: `coordMes`/`coordVista`/`coordQ`/
  `coordProy`/`coordAbiertos`.
  **Grupos COMPACTABLES + filtro por proyecto (21-sep-2026)** — Gerson: "que
  se puedan compactar para que no sea ese listón, y un filtro por proyecto".
  Cada proyecto es una FILA de vidrio clickeable (chevron + nombre + cuántas +
  "la más vieja, N d" + monto): compacta, la pestaña entera es un índice de 15
  filas que cabe en una pantalla; click la abre. `coordAbiertos` guarda los
  proyectos desplegados y se persiste en **localStorage** (`gt-coord-abiertos`)
  — es preferencia de pantalla, NO dato de negocio: nunca toca Supabase. Pill
  "Expandir todo" / "Compactar todo" (solo con más de un grupo). El selector
  de proyecto se arma ANTES de aplicar su propio filtro (si no, al elegir uno
  desaparecerían los demás del select) y trae el conteo; con un proyecto
  filtrado el grupo se abre SOLO (filtrar a uno y verlo cerrado no tendría
  sentido). Botón "Limpiar" cuando hay algún filtro puesto.
  **"¡ Pago nuevo!" (21-sep-2026, pedido de Gerson)**: "un '!' naranja al lado
  de cada proyecto cuando la Lic. Carolina haga un pago nuevo que Ana no ha
  visto". `coordVisto` = `{ [proyecto]: isoTimestamp }` en **localStorage**
  (`gt-coord-visto-<userKey>`, por usuario — cada quien la suya, NO va a
  Supabase: es "lo que YO ya miré", no un dato del negocio). `horaPagada(p)`
  lee el `at` (ISO completo) del audit `paid` que deja `registrarPago` — NO
  `paidAt`, que es una fecha PURA sin hora y no distinguiría dos pagos del
  mismo día. Un proyecto con algo pagado DESPUÉS de `coordVisto[proyecto]`
  muestra el círculo "!" naranja + fondo `C_ULTRA` en su fila y sube al tope
  del orden (antes que "la más vieja"); dentro, la tarjeta del ítem nuevo
  lleva su propio badge "Pago nuevo". Se apaga solo con el gesto de VER: abrir
  el grupo, "Expandir todo", o elegirlo en el filtro de proyecto — todos
  llaman a `marcarVisto(proyecto)`. **Solo Ana** (`isAsistenteCompras`) — el
  aviso, el baseline y sus escrituras a localStorage se gatean a ese rol: sin
  eso, a Gerson o Christian les salía su propio "!" al abrir la pestaña, cuando
  el aviso es para quien de verdad coordina la salida. **Baseline** (`useEffect`
  con `loaded`): la
  primera vez que corre esta función en cada navegador, TODO lo pendiente
  actual queda "visto" de una — si no, el día que salió a producción se
  hubiera prendido medio tablero de golpe con compras viejas que Ana ya
  conocía. `moduleProps` de App.jsx ahora lleva `userKey` (el username) para
  que estas keys por-usuario cuelguen de algo estable.
  **LATIDO de 60 s (21-sep-2026)**: el auto-refresh solo corría con el evento
  `focus`, así que si Ana dejaba "Por coordinar" abierta toda la mañana no veía
  los pagos nuevos de Carolina. Ahora un `setInterval` de 60 s llama a
  `refreshFromCloud` **solo** con la pestaña visible y solo en las vistas que
  son cola de trabajo (`ana`, `prioridades`, `list`) — la sección se lee de
  `secRef` porque el effect corre con deps `[]` y su closure congelaría el
  `sec` inicial. Sigue respetando la guardia de 8 s por mutación local.
  **SERVICIOS DE PROVEEDOR (23-sep-2026, SOLO GeoShopping)** — a Ana se le
  acumulaban en Por coordinar los colados de Concremix, la topografía, etc.:
  un servicio no tiene material que mover ni ficha de recibido. Campo aditivo
  `tipoCompra` ("material" default | "servicio"; las viejas sin campo =
  material) con pills **Material / Servicio de proveedor** en el form, antes
  de Condición de pago. Al PAGAR (`PaymentFormImpl`), si es servicio y no
  tiene camino decidido, queda `deliveryStatus: "cerrado"` + `delivery
  {cerradaSinFicha, esServicio, closedBy: "Automático al pagar (servicio)"}`
  + audit `closed_no_ficha` → cae DIRECTO en Por cerrar contable (mismo
  camino que las 54 "cerradas sin ficha" que ya existían; `clasificar()` no
  se tocó). En la bandeja, el botón "Sin ficha" pasó a **"Es servicio"**: un
  solo confirm, y además marca `tipoCompra: "servicio"` (sirve para las que
  ya estaban acumuladas). Chip azul "Servicio" en la tabla de Solicitudes.
  ⚠ GeoMachinery NO se tocó a propósito (Gerson: "aún nada a geomachinery").
  **ENTREGAS DE PROVEEDOR rediseñada (24-sep-2026)** — Gerson: "qué feo como
  eran antes, ponele la estética de los demás y que sea como Por coordinar".
  `renderEntregasProveedor` usa el MISMO patrón de la bandeja: tira resumen en
  vidrio (con el proveedor · monto · proyectos · llegan hoy · debieron llegar ·
  acceso a Por cerrar contable), filtro por proyecto + buscador + Expandir/
  Compactar todo, y grupos COMPACTABLES por proyecto (`entAbiertos` en
  localStorage `gt-entregas-abiertos`, preferencia de pantalla; con un
  proyecto filtrado se abre solo). Los proyectos con atrasadas suben primero,
  luego los que reciben hoy. Tarjeta: código · chip de llegada (AZUL "Llega"
  · NARANJA "Llega hoy" · ROJO "Debió llegar · hace N d", comparando DÍAS de
  Honduras con `diaHN(arrivalAt)` vs `hoyISO()`) · monto · proveedor · qué se
  compró · quién recibe / cierra con conta; a la derecha las dos acciones de
  Ana: **Ficha en blanco** (ghost) y **Subir ficha firmada** (naranja); como
  enlaces: Cambiar fecha/hora, No la entrega, Ver solicitud y las solo-Gerson.
  Se retiró el banner teal explicativo. La lógica (qué entra, uploadFichaFromCard,
  revertirEntregaDirecta, modal entrega-directa) NO cambió.
  **Orden de pestañas (24-sep-2026)**: Calendario de Pago va JUSTO después del
  Dashboard (antes iba después de Cuentas por pagar).
  **POR CERRAR CONTABLE rediseñada (28-sep-2026)** — Gerson: "feo,
  desordenado, nada user friendly; mismas funciones con la estética de los
  demás". `renderConta` usa el patrón de Por coordinar / Entregas: tira
  resumen en vidrio donde CADA número filtra (por cerrar · en cierre · listas
  para cerrar · sin ficha de logística · falta ficha proveedor · cerradas →),
  filtros (mes de PAGO, botón rojo "Sin ficha de Logística — todos los
  meses", pills de tipo `contaTipo`, proyecto `contaProy`, responsable,
  buscador `contaQ`, Expandir/Compactar, Limpiar, "Cerrar rezagadas en lote"
  solo Gerson) y grupos COMPACTABLES por proyecto (`contaAbiertos`,
  localStorage `gt-conta-abiertos`). Dentro de cada proyecto: primero las
  LISTAS (se pueden cerrar ya), después sin ficha de logística, falta ficha
  del proveedor y con logística; en cada tipo, la que más lleva pagada.
  Tarjeta-fila: código · chip del tipo (VERDE lista / ROJO sin ficha de
  Logística — fondo rojo clarito / ÁMBAR falta ficha proveedor / AZUL con
  Logística) · "pagada hace N d" · monto, proveedor, qué se compró, quién la
  entregó (sin ficha), select "Cierra" editable (updatePurchase + audit
  `cierre_responsable`), enlaces Ver solicitud / Cerrar rezagada / 🗑; a la
  derecha: **Paquete PDF** + **Subir factura y cerrar** (naranja) + "…o
  subir el paquete completo" en las listas, "Ir a Entregas de proveedor →"
  en las del proveedor. Se retiró el banner amarillo de "la regla del
  cierre". La lógica (`clasificar`, uploadPaqueteConta, imprimirPaqueteConta,
  rezagadas) NO cambió. ⚠ **Quién ve TODO cambió**: `esSupervisorConta` =
  admin + tesorería (Gerson y la Lic. Carolina — "solo la Lic. y yo las
  vemos todas"); antes era admin/gerencia/visor_compras. Los demás ven las
  suyas + las sin asignar. `contaMes` arranca con `hoyISO()` (UTC corría al
  mes siguiente la noche del último día). Auditado con la nube el 28-sep:
  sep-2026 = 131 por cerrar (84 listas, 9 proveedor, 38 con logística), 17
  cerradas — igual que la vista vieja.
  **ACCOUNTING (28-sep-2026, pedido de Gerson)**: "Por cerrar contable" y
  "Cerradas" se juntaron en UNA pestaña **Accounting** (`sec` "accounting")
  cuya entrada son dos cajas grandes de vidrio (`renderAccounting`: por
  cerrar con monto + chips "N listas" / "N sin ficha"; cerradas con monto y
  "N este mes"); click → la vista, que lleva "← Accounting" arriba
  (`volverAccounting()`). Por dentro siguen siendo las secciones "conta" y
  "cerradas" (todos los `setSec("conta")` de Por coordinar/Entregas siguen
  sirviendo); la pestaña se marca activa en las tres. La clasificación del
  cierre vive UNA vez a nivel del componente (`clasificarConta`,
  `despachoDeConta`, `esSupervisorConta`, `esMiaConta`) y la usan la entrada
  y el tablero, así los números cuadran. Ana ve Accounting (antes "conta").
  **CERRADAS rediseñada (28-sep-2026)**: mismo patrón que Por cerrar — tira
  resumen (cerradas · monto · proyectos · con factura · paquete completo ·
  rezagadas), filtros mes de CIERRE / proyecto / "Cerró: X" (`cerrQuien`) /
  buscador / Expandir-Compactar / Limpiar, grupos compactables por proyecto
  (`cerrAbiertos`, localStorage `gt-cerr-abiertos`; lo más reciente arriba) y
  tarjeta-fila con chip del tipo (VERDE con factura · AZUL paquete completo ·
  GRIS rezagada), quién cerró y cuándo, y botones Factura · Paquete · PDF ·
  Ver solicitud · Reabrir (admin/Ana) · 🗑 (solo Gerson). Se retiró el banner
  verde. La lógica no cambió.
  **PROVEEDORES rediseñada (28-sep-2026)**: tira resumen (proveedores · con
  datos completos · datos incompletos · con constancia — los dos últimos
  filtran), barra con pills Todos / Datos incompletos / Con constancia
  (`provFiltro`), buscador `provQ`, "+ Agregar proveedor"; lista de filas de
  vidrio AGRUPADA POR LETRA (A, B, C…, acentos normalizados) con 4 columnas:
  nombre + RTN + chips (Datos incompletos ámbar / Constancia verde) ·
  contacto · primera cuenta bancaria (+N más) · **cuánto se le ha pagado y
  cuántas compras** (de cp-purchases por nombre). Click = editar (mismos
  permisos `canManageProviders`). Se retiró el banner azul. "Datos
  incompletos" = sin teléfono O sin cuenta (misma regla que el badge viejo).
  **PROYECTOS rediseñado (18-sep-2026)** — Gerson: "qué horrible se ven, quiero
  que se vean como en GeoCost". `renderProjects` usa las mismas piezas que
  `renderProyectosGrid` de GeoCostModule: tarjetas `.gt-vidrio gt-vidrio-hover`
  clickeables (abren las solicitudes de ese proyecto), nombre en `var(--display)`,
  código en mono, barra de avance carbón (pagado) + naranja (por pagar), y dos
  columnas Por pagar / Pagado. Se retiraron los StatCards de colores sueltos
  (→ tira resumen en vidrio) y el chip "NUEVO" (lo traía casi todo proyecto:
  puro ruido). Chips que quedan: "N vencidas" (rojo) y "Sin código" (gris).
  **De grilla a LISTA + buscador (23-sep-2026)** — Gerson: "no me gusta como se
  ven en ventanitas como kanban, muy desordenadas — cajitas largas de vidrio,
  un buscador porque cada vez son más". La grilla de tarjetas cuadradas
  (`repeat(auto-fill, minmax(300px,1fr))`) se volvió un mosaico sin orden de
  lectura pasados los 20+ proyectos: cada fila del grid traía una cantidad
  distinta de tarjetas y el ojo saltaba sin patrón. Ahora `fila()` (antes
  `tarjeta()`) es una fila `.gt-vidrio` LARGA por proyecto — la misma info de
  siempre (nombre, código, chips, barra de avance, por pagar/pagado, archivo de
  Costos, editar/borrar) acomodada en horizontal en vez de apilada en un
  cuadrado — en una sola columna (`gridTemplateColumns: minmax(0,1fr)`), así se
  lee de arriba a abajo como una lista. Buscador `proyQ` arriba (nombre, código
  o proyecto — mismo patrón que `provQ` de Proveedores) con botón Limpiar. El
  botón "+ Nuevo proyecto" se movió de la cajita punteada al final a la barra
  del buscador. La lógica no cambió.
  **Fix — partida de MOVILIZACIÓN en las solicitudes (18-sep-2026)**: Gerson
  pagó una movilización de Villa San Miguel POR SOLICITUDES (no por el flujo de
  GeoCost) y el Select no le ofrecía la partida "Generales · Movilización".
  `partidasParaModulo` de `geocost-calc.js` ahora incluye las de módulo
  `movilizacion` cuando se piden las de `compras` o `maquinas`: una movilización
  se puede pagar por los dos caminos y las dos bajan de la MISMA partida (no hay
  doble conteo — cada movimiento se cuenta una sola vez).
  **Flujo de cierre contable (19-ago-2026, pedido de Gerson)**: el form de
  solicitud lleva `cierreResponsable` (quién cierra con conta) y
  `detalleMateriales` (qué se compra, según cotización — opcional).
  **Campo único (20-ago-2026)**: el form tenía "Descripción de la compra" Y
  "Detalle de materiales" — lo mismo tipeado dos veces. Ahora hay UN solo
  textarea ("Qué se está comprando, tal cual la cotización") que escribe en
  `description`, que es lo que leen la tabla, las cards, la ficha de entrega,
  los despachos y los reportes. `detalleMateriales` sobrevive solo en las
  solicitudes viejas, y el paquete/reportes/modal lo muestran únicamente si
  DIFIERE de `description` (si no, saldría duplicado). El kanban
  "Por coordinar" de Ana quedó LIMPIO: solo lo accionable (pagadas sin camino);
  al elegir salida la compra se va a su pestaña. Pestañas nuevas (Ana las ve):
  **🏪 Entregas de proveedor** (deliveryStatus entrega_proveedor, por proyecto:
  descargar ficha en blanco → el ingeniero la firma → Ana la sube →
  ficha_adjunta) y **🧾 Por cerrar contable** (todo lo pagado con camino
  decidido y sin `conta`; filtro por MES de pago, default mes actual — el
  backlog histórico no se viene encima). Badges de responsabilidad: "SIN FICHA
  de Logística" (despacho entregado sin ficha — presión a logística),
  "Falta ficha del proveedor", "Con Logística", "Ficha lista". Cierre = subir
  el paquete digitalizado que devuelve conta (`p.conta = {fileId, cerradoPor,
  cerradoAt}`, ortogonal a deliveryStatus — no toca Resumen/Recepción);
  `imprimirPaqueteConta` genera portada + checklist + docs embebidos (imágenes
  a página; PDFs se listan). `uploadPaqueteConta`/`reabrirCierreConta` con el
  patrón atómico de uploadFichaFromCard. Futuro: módulo GeoAccounting para
  que conta vea estas compras (aún NO se hace).
  **Código de solicitud (19-ago-2026)**: `codigo` correlativo por tipo y año —
  `MAT-2026-0001` en GeoShopping vs `MAQ-2026-0001` en GeoMachinery, para que
  conta distinga el módulo de origen. Numeración GLOBAL del año (no por
  proyecto: dos proyectos pueden compartir prefijo, ej. RETENCIÓN-AUREA y
  RETENCIÓN-CC EL CAMINO); el proyecto se muestra siempre al lado.
  `siguienteCodigo(lista)` lo asigna al crear (borrador o aprobada);
  `asignarCodigosFaltantes` (botón solo-admin en Solicitudes) numera las
  viejas por createdAt con getCloud + verify. Sale en la tabla, en las cards
  y en el paquete de cierre.
  **Proveedor nuevo desde la solicitud (20-ago-2026)**: si el nombre tipeado
  en el form no está en cp-providers, aparece el aviso "🆕 Proveedor nuevo" +
  checkbox "Guardar su ficha completa" que expande teléfono/contacto/correo/
  nota (los bancarios y RTN ya estaban en el form). `registrarProveedorSiNuevo`
  corre al guardar la solicitud (borrador o aprobada): crea el proveedor con
  ficha completa (autoImported:false) o, si ya existe, solo RELLENA huecos
  (nunca pisa datos cargados a mano). cp-providers es compartida: queda
  disponible en ambos módulos al instante. Best effort: si falla, la
  solicitud igual se guarda y el auto-import del load lo recupera.
  **Constancia de pagos a cuenta (19-ago-2026)**: `provider.constanciaFile`
  — se sube UNA vez en la ficha del proveedor (`subirConstanciaProveedor`,
  disponible en el form de proveedores de AMBOS módulos: cp-providers es
  compartida, así que subirla en uno sirve para los dos) y
  el paquete de cierre la adjunta sola en todas sus compras (conta la exige
  en cada paquete; antes Ana y Fernando la buscaban a mano).
  **Paquete de cierre = PDF REAL (19-ago-2026)**: `imprimirPaqueteConta` ya no
  genera HTML imprimible sino un PDF descargable con jsPDF + merge de pdf-lib:
  portada con logo/branding + datos + checklist de conta (ficha si aplica,
  comprobante, cotización, constancia de pagos a cuenta, factura) y a
  continuación TODOS los anexos (PDFs mergeados de verdad, imágenes a página).
  Nombre: `PAQUETE-<codigo>.pdf`.
  **ORDEN y anti-duplicado (20-ago-2026)**: los anexos se ensamblan TODOS con
  pdf-lib (antes las imágenes iban primero con jsPDF `addImage` estiradas a la
  fuerza — salían "pandas" — y los PDFs después, así que el orden se perdía).
  Orden: portada → **FACTURA escaneada** → ficha de recibido → comprobante y
  cotización → constancia. Las imágenes van en hoja horizontal o vertical
  según su forma, escaladas proporcionalmente, y se normalizan a PNG con un
  canvas (pdf-lib NO acepta webp/gif: el comprobante de prueba era `image/webp`
  y se habría perdido). **Duplicado**: la ficha que sube Logística suele ser el
  PDF completo de la Ficha de Entrega, que YA lleva cotización y comprobante
  adentro; si ese PDF trae 3+ páginas (`fichaTraeAnexos`) esos dos no se
  vuelven a adjuntar.
  **Cierre por FACTURA (19-ago-2026)**: `uploadPaqueteConta(purchase, file, tipo)`
  — tipo "factura" (el camino corto: conta escanea solo la factura que trajo el
  proveedor) o "paquete" (todo digitalizado). Cualquiera CIERRA la compra:
  `conta.facturaFile` o `conta.fileId`.
  **Cierre de REZAGADAS (20-ago-2026, solo Gerson)**: las compras anteriores a
  este flujo ya cerraron con conta en la vida real pero quedaron varadas en
  cualquier fase. `aplicarCierreRezagadas(lista, responsable, nota)` las manda
  a Cerradas SIN pedir archivo: `conta = {legacy:true, tipo:"rezagada",
  cerradoPor, cerradoAt, nota}` + audit con quién lo hizo, y cierra también sus
  despachos abiertos en `lg-despachos` (si no quedan trabados pidiendo una
  ficha que nunca va a llegar). El modal (`rez` / `modalRezagadas`) pide el
  RESPONSABLE — selector con los labels de USERS + "Otro (escribir)" — en dos
  modos: **una** (✅ en la card, junto al 🗑) o **lote** (botón en la barra de
  "Por cerrar contable", con fecha de corte: cierra todo lo pagado hasta esa
  fecha). Helper `yaCerradaConta(z)` = fileId || facturaFile || legacy — TODAS
  las clasificaciones lo usan, así una cerrada desaparece de Por coordinar,
  Entregas de proveedor y Por cerrar a la vez.
  **Borrado total de una solicitud (20-ago-2026)**: `borrarSolicitudCompleta`
  + `puedeBorrarSolicitud` (= `userName === "Lic. Gerson Trochez"`, pedido
  explícito: "solo a mi porfa"). Papelera 🗑 en las cards de Por coordinar,
  Por cerrar contable y en la tabla de Cerradas. Doble confirm (el segundo
  solo si ya tiene documentos), y limpia TODO el rastro: la solicitud
  (getCloud + verify), los despachos de `lg-despachos` con ese
  `sourcePurchaseId` y los `cp-file-*` adjuntos (cotización, comprobante,
  ficha, factura/paquete de conta) con `store.remove(quiet)`. Es para pruebas
  y solicitudes creadas por error que ya avanzaron en el flujo.
  **Pestaña ✅ Cerradas (19-ago-2026)**: `renderCerradas` — archivo con filtros
  por MES de cierre, PROYECTO y búsqueda libre; tabla con código, fecha, monto,
  quién cerró, y botones para ver la factura/paquete, re-descargar el PDF y
  reabrir (admin/Ana). Se sacó de "Por cerrar" para que ese tablero quede solo
  con lo pendiente.
  **SUPPLY CHAIN v3 (18-sep-2026)** — Gerson: "qué desorden, no dan ganas de
  ver eso". Se retiró toda la presentación de la v2 (ventanitas por proyecto,
  ranking "a quién apurar", tabla y los filtros de rango libre / proyecto /
  responsable / orden por atraso). Ahora es lo que él pidió: **las compras YA
  PAGADAS agrupadas por DÍA DE PAGO** (lo más reciente arriba), en tarjetas
  `.gt-vidrio` como Prioridades, cada una con su proyecto, proveedor, monto y
  **en qué etapa del proceso va** (chip de color + punto de semáforo por días
  parados + de quién depende). Filtros: **semana de LUNES A DOMINGO** (default)
  · Semana pasada · Este mes · Todo, chips por etapa, "ver cerradas" y
  buscador. Click en una tarjeta abre esa solicitud. `etapaDe()` quedó
  INTACTA (la clasificación auditada en ago-2026); los estados se redujeron a
  `scModo`/`scEtapas`/`scQ`. Se retiró la tira resumen
  (23-sep-2026, Gerson: "no necesito ese cuadrito") — quedan solo los filtros
  y la lista agrupada por día. **24-sep-2026**: Supply Chain muestra SOLO lo
  que sigue EN CAMINO — se excluyen `por_cerrar` y `cerrada` (`FUERA_SC`;
  Gerson: "si ya pasó a por cerrar con conta significa que ya se entregó, eso
  lo reviso yo allá"; se retiró el check "ver cerradas"). Quedan por
  coordinar, en logística y con el proveedor (`falta_ficha` también se sacó el
  mismo día: con el candado de GeoLogistics esa etapa solo la llenan 98
  despachos VIEJOS —jun-ago— entregados sin ficha, y Gerson los revisa uno a
  uno en Por cerrar contable con el botón rojo **"Sin ficha de Logística
  (N)"** (`contaSoloSinFicha`: muestra SOLO esas, de TODOS los meses — con el
  default del mes actual quedaban escondidas). El filtro de etapa
  es MULTI-selección (`scEtapas` array, [] = todas): "ver las que están en
  logística y por coordinar al mismo tiempo". El texto de abajo describe la v2,
  que ya no existe — se conserva solo por el detalle de la lógica de etapas.
  **SUPPLY CHAIN — presentación v2 (3-sep, RETIRADA el 18-sep)**: sin título, filtro compacto
  en una fila (se quitaron el select de proyecto y el input de
  responsable), tira resumen (dinero en cadena + etapas como CHIPS
  clickeables del semáforo), **VENTANITAS `.gt-vidrio` por proyecto**
  (click = toggle `scProy`; barrita segmentada por etapa con `ETAPAS[].bar`;
  se calculan sobre `base0` = todos los filtros MENOS proyecto y etapa, para
  que al elegir una no desaparezcan las demás; `base` = base0 + proyecto),
  tira "A quién apurar" solo si hay atrasos (click = filtra responsable, el
  chip "Responsable: X ×" lo quita), tabla en vidrio con título dinámico.
  ETAPAS recoloreadas al semáforo (gris esperando pago · naranja por
  coordinar · azul logística/proveedor · amarillo falta ficha/por cerrar ·
  verde cerrada) sin emojis; `sem()` gris/amarillo/naranja como PUNTO de
  color + texto carbón (compartía los pares color/bg de la etapa vecina). La
  lógica de clasificación de abajo NO cambió. Revisión adversarial (7-sep,
  18 agentes) aplicada: chip "Proyecto: X ×" en el filtro (scProy quedaba
  pegado a un proyecto que ya no estaba en base0 tras cambiar de mes y solo
  salías con Limpiar); las demás ventanitas NO se atenúan si la activa ya no
  existe; con un chip de etapa activo la ventanita muestra "N de M" y atenúa
  los otros segmentos de su barrita; el monto grande de la ventanita es SIN
  cerradas (igual que la tira; lo cerrado va al tooltip); foco visible con
  teclado (`.gt-vidrio[role=button]:focus-visible` en GT_CSS, sin
  outline:none inline) y `aria-pressed` en ventanitas/chips; leyenda del
  semáforo de días en el header de la tabla; filtro en 3 grupos con
  borde izquierdo (los `sep` sueltos quedaban huérfanos al envolver);
  pills activas con ORANGE_DARK (el naranja puro con texto blanco daba
  2.97:1 — aplicado también a Dashboard y Solicitudes); token
  `--naranja-texto-chico` #A94E16 para naranja en texto ≤12px; ventanitas
  inactivas a .88 + barrita desaturada (al .55 el texto no se leía);
  `bar` de por_cerrar #8A5A00 (era casi igual a falta_ficha) y gap 1px
  entre segmentos; anillo del vidrio más marcado (sobre #F9F9F8 el borde
  desaparecía); thead visible + scroll con paddingBottom.
  **SUPPLY CHAIN (24-ago-2026, reemplaza "Resumen")**: `renderSupplyChain` —
  para ver en 5 s dónde está parada cada compra, desde cuándo y de quién es la
  pelota. `ETAPAS`/`ETAPA` a nivel de módulo; `etapaDe(x)` clasifica en UNA
  etapa por orden de prioridad: esperando_pago (status validado) → cerrada
  (yaCerradaConta) → por_cerrar (ficha_adjunta/cerrado) → falta_ficha (despacho
  entregado/cerrado) → en_logistica (despacho vivo, NO cancelado) →
  con_proveedor (entrega_proveedor) → por_coordinar. El reloj de cada etapa
  corre desde su hito (`desde`) y el semáforo es ≤3d verde / 4-7 ámbar / +7
  rojo. Filtros de tiempo sobre la FECHA DE PAGO: todo / mes / semana (7 días
  desde la fecha elegida) / rango; más proyecto, responsable, texto y etapa
  (click en la tarjeta). OJO: las tarjetas y el ranking se calculan sobre
  `base` (todos los filtros MENOS etapa) para poder saltar entre etapas; la
  tabla usa `filas` (base + etapa). Índice `despPorCompra`: ignora CANCELADOS
  (esa compra volvió a Compras) y gana el despacho MÁS RECIENTE. Ranking "a
  quién apurar" = suma de días de las paradas >3d por responsable CANÓNICO
  (`quien` agrupa, `detalle` muestra el motorista — antes "Logística" se
  fragmentaba en 3 etiquetas y el ranking mentía). Auditado con data real: las
  321 compras quedan clasificadas, ninguna invisible.
  **Revisión adversarial aplicada (24-ago-2026)**: eje de tiempo `fEje` cae a
  validatedAt/createdAt (había compras pagadas viejas sin paidAt que quedaban
  invisibles con el filtro de mes Y sin contar como atrasadas); esperando_pago
  ya NO se cuela en los filtros de fecha (antes contaminaba el dinero total con
  todo lo no pagado de la historia); `diasDesde` compara SOLO fechas (paidAt es
  medianoche UTC: de las 18:00 en adelante contaba un día de más y cruzaba el
  semáforo); `scMes` default con partes LOCALES y el mes elegido siempre en el
  select; deliveryStatus "recibido" sin despacho → falta_ficha (el material ya
  está en obra, el pendiente es de Logística); MAQUINAS se atribuye a Fernando
  igual que en el kanban; el orden por atraso deja las cerradas al final;
  destildar "ver cerradas" limpia el filtro de esa etapa.
  **Barra de filtros de Solicitudes rediseñada (24-ago-2026)**: botones en vez
  de menús. `filter = {ver, project, provider, mes}` — `ver` es
  "pendientes" (DEFAULT, la cola de pago de Carolina) | "pagadas" | "todas";
  el rango Desde/Hasta se reemplazó por un selector de MES que aplica sobre la
  fecha que corresponde (`fechaFiltro`: pago si ya se pagó, carga si no). Los
  botones de ORDEN son contextuales: viendo pendientes salen solicitud_asc
  ("la que más espera", default) / solicitud_desc; viendo pagadas, pago_desc /
  pago_asc; en "ambas" se suma "pendientes primero" (estado). `setVer` reajusta
  el orden solo si el activo no aplica a la vista nueva — si no, quedaba un
  orden sin botón activo. Antes: `listOrden` con select y default por rol.
  **Orden de Solicitudes por FECHA DE PAGO (24-ago-2026)**: `listOrden`
  (pago_desc | pago_asc | estado) con selector en la barra; las sin pagar van
  al final. OJO: para `tesoreria` el default es "estado" — Solicitudes ES la
  pantalla de Carolina y su cola de pago quedaba al fondo de 321 filas.
  **Reporte ejecutivo de MATERIALES (19-ago-2026)**: `exportComprasEjecutivoPDF(mes)`
  en la pestaña Costos (botón + input month) — clon del "Costo de Mano de Obra"
  de GeoTeam: portada con KPIs + dona SVG por proyecto + gasto/mezcla por
  empresa (las empresas sin gasto NO se pintan), y detalle por proyecto con
  CADA compra y su `detalleMateriales`. Mes por `paidAt`; las fechas se
  formatean con `timeZone:"UTC"` porque paidAt se guarda como medianoche UTC
  (sin eso mostraba el día anterior en Honduras).
- **GeoMachinery = `PurchasesModule` con `modo="maquinas"` (28-sep-2026, pedido
  de Gerson: "aplicale la misma estética y funcionamiento que GeoShopping,
  exactamente igual")**. `MachinesModule.jsx` se RETIRÓ (queda en el historial
  de git); App.jsx monta `<PurchasesModule modo="maquinas" />`. Todo lo de
  GeoShopping (vidrio, Prioridades, Cuentas por pagar, Calendario, Supply
  Chain, Por coordinar, Entregas, Accounting, Proveedores, ítems del
  presupuesto, fecha requerida, servicios…) es el MISMO código para los dos:
  lo que se mejore en uno le llega al otro. Lo que cambia vive en
  **`CFG_MODULO`** (a nivel de módulo en PurchasesModule): `key`
  mq-purchases, `otraKey` cp-purchases (para el disponible de GeoCost),
  `priKey` **mq-prioridades**, `cxpKey` **mq-cxp** (colas SEPARADAS por
  módulo — decisión de Gerson), `prefijo` MAQ (`siguienteCodigo(lista, año,
  prefijo)` y "Asignar códigos faltantes"), despachos `source: "maquinas"` /
  `tipo: "repuesto_maquinas"`, `moduloPartida` "maquinas" (Select de partida,
  `LineasPresupuesto modulo=` y `CorreccionFormImpl`), coordinador Fernando.
  Roles en modo máquinas: `isCoordinadorMaquinas` (Fernando) crea/edita,
  entrega, maneja proveedores y máquinas; `isAsistenteCompras` pasa a
  significar "quien COORDINA en este módulo" (Ana en GeoShopping, Fernando en
  GeoMachinery) → la bandeja, el aviso "!" de pago nuevo (solo él), cerrar
  contable; `isAnaRol` es el rol crudo de Ana (permisos de proveedores/
  logística). El menú reducido de Ana es SOLO en GeoShopping. Arturo
  (compras_ops) es SOLO LECTURA en GeoMachinery (`isCostos` no lo incluye,
  `isVisorCompras` sí). Fernando arranca en Solicitudes, ve Dashboard/Supply
  Chain/Prioridades (solo mira) y NO ve Costos. Pestañas PROPIAS (solo
  `esMaq`): **Máquinas** (`renderMachines` en vidrio: tarjeta por máquina con
  foto, tipo, diámetro, solicitudes y lo pagado; `MachineFormImpl` a nivel de
  módulo; `canManageMachines` = admin/costos/Fernando/Jorge; mq-machines con
  `mergeById`) y **Costos** (`renderCostosMaq` en vidrio + `datosCostosMes` y
  `exportMaquinasEjecutivoPDF` portados TAL CUAL; `canSeeCostosMaq` =
  admin/gerencia/costos). El Dashboard suma la tarjeta "Gasto por máquina"
  (con CSV) y su botón de reporte PDF usa el de maquinaria. El form trae
  "Máquina vinculada (opcional)" (`machineId`) y el detalle la muestra. En Por
  coordinar el tercer botón es **"Sin logística"** (su "Cerrar sin logística"
  de siempre: `closed_no_logistics`, NO marca servicio). Header con la llave
  inglesa. Las preferencias de pantalla en localStorage llevan sufijo `-mq`
  (`gt-coord-abiertos-mq`, `gt-coord-visto-mq-<user>`…) para no mezclarse.
  GeoCost ahora deja "Dividir en ítems" también en repuestos (mq-purchases).
  **Líneas A MANO + "qué se gestiona" (12-oct-2026, pedido de Gerson)**: en
  GeoMachinery ya NO se eligen ítems de la receta. `esMaqForm` (prefijo MAQ)
  en `PurchaseFormImpl`: (1) pills **Repuestos · Compras varias · Mantenimiento
  · Servicio de proveedor** (`CATEGORIAS_MAQ`, campo aditivo `categoriaMaq`;
  solo "servicio" pone `tipoCompra: "servicio"`, las otras tres son material y
  pasan por Por coordinar como siempre; chip gris en la tabla); (2) UNA
  **Partida del presupuesto** (Select con `opcionesPartidas(pres,"maquinas")`,
  disponible y sobregiro sobre el monto total) que se elige SOLA
  (`unicaPartidaMaq`: la única, o la de módulo máquinas, o la que se llame
  "Costos de operación" — en todos los presupuestos es la misma); (3) la
  cotización **línea por línea**: cantidad · unidad (datalist `UNIDADES` de
  GeoCost) · qué es · monto L con ISV, "+ Agregar línea", suma; el **monto
  total sigue a la suma** mientras nadie lo toque (si se escribe otro total —
  ISV o flete al final — se respeta y la diferencia se reparte proporcional).
  Se guarda como `lineas: [{id, partidaId (la elegida), categoria, nombre,
  unidad, cantidad, monto, manual:true}]` y `description` = un renglón por
  línea ("2 Cubeta × Aceite hidráulico ISO 68") + detalle adicional. Aprobar
  exige ≥1 línea completa (las solicitudes VIEJAS de texto libre se siguen
  pudiendo aprobar sin líneas: su texto queda en "Detalle adicional").
  GeoCost: `movimientosCompras` pone la unidad de las líneas manuales en la
  descripción y emite un movimiento por línea a esa partida (prueba
  `tests/geocost-maq.test.mjs`); en Movimientos NO se ofrece "Editar ítems"
  para ellas (lo pisaría con los de la receta). Corregir compra pagada en
  GeoMachinery = una partida; las líneas manuales se re-apuntan sin perder
  sus nombres. DetailView muestra el nombre escrito + la partida al lado.
  **Fix de paso**: el form de solicitud (ambos módulos) se salía del modal por
  la derecha con los nombres largos de proyecto — grid `minmax(0,1fr)` y
  selects `width:100%`.
  **LEER LA COTIZACIÓN EN PDF + ISV automático (12-oct-2026, pedido de
  Gerson)**: "hay cotizaciones muy largas y es tedioso escribir una por una;
  que el sistema la lea y él solo valide y corrija". `src/leer-cotizacion.js`
  SIN servicios externos: `leerPdf` usa **pdf.js** (`pdfjs-dist`, carga
  diferida con `safeDynamicImport`, worker por `?url`) para sacar el texto con
  su posición → `filasDeItems` arma filas/celdas → `parsearCotizacion` (PURA,
  `tests/leer-cotizacion.test.mjs`) reconoce: ÍTEMS = toda fila donde
  cantidad × precio = un número a la derecha (total de línea; o subtotal y
  después descuento → neto, caso REASA; o total CON ISV = q×p×1.15, caso
  Larach — ahí el monto queda sin ISV); descripción = lo que está antes de la
  cantidad (sin # de fila, moneda ni "Disponible/Nacional") + hasta 2
  renglones de continuación alineados; unidad = palabra pegada a la cantidad
  (`unidadDe`; "L." es Lempiras, nunca Litro) o pista en la descripción
  ("CK-4/CUB" → Cubeta); coma decimal ("278,26"); subtotal/ISV/total por
  etiqueta ("Monto Bruto", "Sub-Total", "Imp. S / V", "Monto Neto", "Total a
  pagar"…); N° de cotización; RTN; proveedor contra cp-providers (primero por
  RTN, luego por nombre; nunca nuestras empresas). Medido el 12-oct contra 58
  cotizaciones REALES en PDF con texto del sistema: lee bien 52 (las otras son
  estados de cuenta, rentas en dólares y un PDF con texto roto); de 113
  cotizaciones, 42 son FOTOS y 13 PDFs escaneados — esos NO tienen texto y se
  siguen escribiendo a mano (para leerlos haría falta OCR o IA: servicio
  externo, a consultar con Gerson). En GeoMachinery (`esMaqForm`): caja
  "Leer la cotización · Subir PDF y leer" arriba de las líneas (y "Leer la que
  ya está adjunta"); subir la cotización en el FileSlot de abajo también la lee
  si no hay líneas. Llena líneas, N°, proveedor (+ cuenta bancaria y RTN del
  maestro, solo si el campo estaba vacío), adjunta el PDF y pone el total.
  Banner verde "Leí N líneas de X · Suma + ISV = total · la cotización dice …
  ✓ cuadra" o ámbar si no cuadra. **ISV**: campo aditivo `sumarIsv` (default
  true en solicitudes NUEVAS de GeoMachinery; las viejas no lo traen): las
  líneas van SIN ISV y el monto total = suma × 1.15 ("Subtotal · ISV 15 % ·
  Total"), checkbox para desmarcarlo en compras exentas.
  **El lector también en GeoSupply y GeoShopping (12-oct-2026, 2ª pasada)** —
  Gerson: "¿cuando Ana suba la cotización se llenan los campos solos?" y "que
  Finanzas en GeoShopping tenga lo mismo, pero allá sigue la receta del
  pastel: ¿cómo busca en el presupuesto un tubo PVC de 2"?". Piezas PURAS
  nuevas en `leer-cotizacion.js` (con pruebas): `tokensDe`/`parecido`
  (palabras sin acentos ni códigos de producto, medidas normalizadas — 2" →
  2in, 1-1/4" → 1y1/4in, #5/No.5 → n5, 6x2.35m → 6m 2.35m — y si dos textos
  traen medidas de la MISMA clase que no coinciden, casi seguro son otra cosa),
  `emparejar` (mejor pareja primero, uno-a-uno opcional), `ajusteAlTotal`
  (factor de los renglones al total: isv ×1.15 · exenta · proporcional
  —descuento global o mezcla de exentos— · no_cuadra · sin_total),
  `lineasSupplyDesdeLectura`/`lineaSupplyDe` (GeoSupply: contra lo POR
  COTIZAR del proyecto, P.U. CON ISV, varilla en lances) y
  `lineasPresupuestoDesdeLectura` (GeoShopping: contra las partidas
  comprables de la receta; con varias SOLUciones elige la que reconoce más; a
  igualdad gana la partida CON plata —la de $0 es material del cliente—; la
  varilla de una partida en Ton va a "Acero…" con #/largo/lances).
  **PRESENTACIÓN — rollos/cajas (30-oct-2026, caso FANASA)**: "POLIDUCTO DE
  3/4" X 100 YDS" son ROLLOS de 100 yardas; Ana cargó 8 Yarda a L 395 y el
  semáforo dio +5,318 % (era 800 Yarda a L 3.95, −46 %). `presentacionEn`
  reconoce "X 100 YDS / X 6 M / x 100 lbs / X 100 PIES" (no "4 X 8 PIES", que
  es medida) → `item.presentacion {n, unidad}`; `cantidadEnUnidad` convierte
  SOLO si lo pedido (o la partida) viene en esa unidad: `lineaSupplyDe` y
  `lineasPresupuestoDesdeLectura` multiplican la cantidad y el P.U. sale
  dividido; `leido.convertido` se muestra ("= 800 Yarda, cada uno trae 100").
  El "100" ya no se pierde del nombre. UNIDAD_DE suma Yarda y Pie. Red de
  seguridad: un rojo de +200 % o más avisa "¿Viene por rollo, caja o
  paquete?" en el form de Ana y en la aprobación. CTZ-2026-0018 / MAT-2026-0618
  / SUP-2026-0007 se corrigieron en la nube (800 Yarda, monto intacto) y la
  CTZ-2026-0020 (la MISMA cot. 55 reenviada por las "792 pendientes") quedó
  rechazada por duplicada.
  **MEMORIA ("que aprenda")**: `memoriaDeCompras(purchases)` + `recordar`:
  cada línea de cp-purchases guarda ahora `cot` (ADITIVO: cómo lo escribió el
  proveedor; lo escriben `lineasParaGuardar` y `borradorDesdeCotizacion`), y
  también cuentan los `sustituto.nombre` viejos. Se recuerda por NOMBRE de
  partida, así sirve entre proyectos con la misma receta. Si el recuerdo era
  sustituto, la línea nace ya como "Es otro material" (ICMOVA: GRAVIN 3/8 →
  Concreto premezclado, sustituto Gravín 3/8). **GeoSupply**
  (`CotizacionFormImpl`): caja "Leer la cotización" arriba (sube el PDF a
  `cp-file-*` y lo lee; el "Adjuntar PDF" de abajo también lee si no hay
  ítems; "Leer la que ya está adjunta" baja el archivo con `bajarArchivo`):
  marca los ítems, pone cantidad (parcial si es menos), P.U. con ISV, total,
  N° y proveedor (solo si estaban vacíos). Debajo de cada ítem "En la
  cotización: …"; los renglones que no son de lo pedido salen en el aviso con
  un select "Es… (elegí de lo pedido)" (`asignar`), y el mensaje rojo de abajo
  explica que no cuadra por esos renglones (no por el ISV). **GeoShopping**
  (`PurchaseFormImpl`, NO en GeoMachinery): `cajaLeer`/`avisoLectura` son JSX
  compartidos por los 3 casos; con receta llena los ítems de
  `LineasPresupuesto` (cada uno con `leido` = lo que decía el PDF — se
  muestra, no se guarda) y el MONTO = total de la cotización; los sin ítem
  quedan en AMARILLO "No lo encontré en el presupuesto — elegí de qué ítem
  sale o quitalo" (categoría/solución libres, siguen a las pills;
  `errorLineas` no deja guardar hasta resolverlos) y con "Es otro material"
  pre-llenado con el texto de la cotización. El aviso se actualiza en vivo
  (verde cuando todos tienen ítem) y con varias soluciones trae un select
  para mover TODO a otra (`cambiarSolucionLineas`). Sin receta llena "Qué se
  está comprando" un renglón por ítem. **Medido el 12-oct** contra las 20
  compras reales que ya tenían ítems de receta + PDF (memoria SIN la propia
  compra): 16 renglones al ítem correcto, **0 equivocados**, 7 sin ítem (2 no
  están en la receta —tubo 1-1/4" y 1/2"—, 3 Admix de Lazarus que se aprenden
  en cuanto Finanzas los confirme una vez, 2 ruido del PDF). Además: el N°
  de cotización exige un dígito y la misma línea ("COTIZACION\nFecha" daba
  "Fecha"; "No.: S61334" de Construsmart ahora sí sale), y las palabras de
  giro ("ferretería", "distribuidora"…) ya no identifican proveedor solas.
  Verificado el 28-sep montando el módulo con cada rol (admin, Fernando,
  Carolina) sobre la data real, todas las pestañas sin errores, y GeoShopping
  igual que antes.
- `HRModule.jsx` (GeoTeam) — Empleados (fotos), Contratos (tabla por urgencia),
  Planilla, Asistencia (cuadrillas → grid 1/0/INC/DT/DT2/TF + override 1*),
  Horas Extras, Costos MO, Dashboard, KPI's, Llegadas tardías. Bonificaciones
  oculto (código intacto).
  **REDISEÑO GeoCore (15-oct-2026, pedido de Gerson: "todo feo, desordenado,
  muchos colores, mucho texto")** — primera pasada: encabezado, Dashboard,
  KPI's y Empleados (el resto de pestañas viene una por una, empezando por
  Contratos). GT_CSS se monta en TODO GeoTeam; encabezado igual al de
  GeoInventory (← · logo · GeoTeam · pista Subterra/Geotecnica · usuario ·
  Cerrar sesión), pestañas SIN emojis, se retiraron el hero con la ilustración
  `TeamSVG`, el título repetido de la pestaña y el badge "N activos". Helpers
  del componente: `tituloCaja`, `cifra`, `pista` (control segmentado de
  spans, sirve a solo-lectura), `PAL_MES`. **Dashboard** (v2 del mismo día — Gerson:
  "la primera mejor masa salarial en ruedita por departamento, cambiando entre
  meses; todas del mismo tamaño") = 3 cajas de vidrio IGUALES que llenan el
  alto, con la pista de los últimos 6 meses arriba (`dashMeses[0]` = mes a la
  vista): Masa salarial (dona por departamento del ROSTER de ese mes: salario
  + bonificación de quien estuvo en la empresa —entró antes de fin de mes y no
  había salido antes del 1—; con hideSalary cuenta personas) · Por proyecto
  (total de mano de obra del mes arriba + barras, de `statsDeMes`) · Hoy (dona
  GeoClock + "Pendientes" clickeables a su pestaña). **KPI's** = 5 cajitas (Colaboradores,
  Masa salarial —Antigüedad con hideSalary—, Ausentismo, Tardanzas, Rotación) +
  "Masa salarial del año" y "El equipo". Gráficos SVG recoloreados a
  carbón/naranja/gris (planilla real naranja, proyección gris) y las
  iniciales de los avatares sin arcoíris. **Empleados** = CARNETS de vidrio
  (`CarnetFrente` a nivel de módulo: franja carbón con curvas de nivel,
  empresa, tipo de contrato, foto, nombre, cargo, código y depto/fin de
  contrato); filtros: buscador, depto y pista Todos/Permanentes/Temporales/
  Honorarios. Click → `CarnetVolteo` (portal a body, FLIP desde el rect del
  carnet tocado + rotateY 180°, Esc/fondo cierran con la animación inversa,
  respeta reduced-motion): el DORSO trae toda la ficha (trabajo, identidad,
  contacto, salario si !hideSalary, equipo de GeoInventory) con "Editar
  ficha" (abre el modal `ee` de siempre) y "Eliminar" (mismos permisos que
  la ✕ vieja). ⚠ Dashboard, KPI's y Empleados quedan FUERA del `<fieldset
  disabled>` de solo-lectura (`SIN_CANDADO`): no tienen controles que
  escriban (se ocultan por rol) y así gerencia/costos pueden buscar.
  **Animaciones (15-oct-2026, "que carguen, cool pero smooth y lento")**:
  `grafAnim` (0→1 dos frames después de entrar a Dashboard/KPI's o cambiar de
  empresa; el useEffect va ANTES del return de "Cargando") alimenta
  `GTDonut progreso` (las tajadas se dibujan en barrido con transición de
  stroke-dasharray + rotate, y al cambiar de mes se reacomodan suave),
  `GTMonthBars progreso` (crecen desde abajo escalonadas), los anchos de las
  barras y `CuentaArriba` (cifras que cuentan hasta su valor en ~1.4 s;
  respeta reduced-motion; ~2.4 s). `ANIM_GRAF` = 2200ms cubic-bezier(.22,1,.36,1). ⚠ El stroke-dasharray de la dona va en `style` (como ATRIBUTO SVG Chrome no lo transiciona y la dona salía de golpe).
  **CONTRATOS (rediseño 15-oct-2026, "cajitas largas por empleado que se
  puedan compactar o desglosar, sin tanto texto")**: `ContractsView` (sigue
  siendo función, no componente) = 4 contadores de vidrio que FILTRAN
  (`ctFiltro`: vencidos · vencen en 30 días · vigentes · sin contrato),
  barra con buscador (nombre/DNI/código), Expandir/Compactar todo, "Generar
  faltantes (N)" y "+ Nuevo contrato"; y UNA FILA DE VIDRIO por colaborador
  ordenada por urgencia (vencidos primero): foto (iniciales en gris suave,
  `EmpAvatar suave`), nombre, cargo, tipo ("Por obra"/Permanente/Honorarios),
  "N días con contrato" (`cumulativeDaysOf`, toda la cadena de renovaciones),
  fecha de fin y chip de estado. ⚠ SOLO 3 COLORES y nada de negro (Gerson,
  2ª pasada del 15-oct): rojo = vencido, naranja = alerta (≤30 d) y acción
  principal (Renovar, Crear), verde = vigente/indefinido y "Pasa a
  permanencia". Se RETIRÓ todo lo de la regla de 180 días (barra, filtro
  "cerca de 180", "cumplió 180") — Gerson la va a repensar; el 3er contador
  ahora es "Vigentes". Click → se despliega (`ctAbiertos`) con
  inicio/fin/grupo/salario (si !hideSalary)/días con contrato, historial (cada
  contrato con "Editar" → modal `cte`) y Renovar / Pasa a permanencia / Crear
  contrato (mismos modales `ctr`/`perm`/`ctn`). Columnas de ancho FIJO para
  que las filas queden alineadas. El banner del snapshot de mayo se volvió un
  enlace discreto al pie. Contratos entra a `SIN_CANDADO` (los botones que
  escriben se ocultan con isReadOnly).
  El carnet ya no usa backdrop-filter mientras viaja (era el tirón al
  cerrarlo): caras sólidas, fondo oscuro sin blur, will-change, abrir ~0.9 s
  desacelerando y cerrar ~0.8 s ease-in-out.
  **PLANILLA (16-oct-2026, "mi mayor gol": la Lic. Carolina la genera acá,
  ya no en Excel)**: `src/planilla-calc.js` (lógica PURA, probada en
  `tests/planilla-calc.test.mjs`) + `src/planilla-export.js` (PDF con jsPDF
  legal apaisado y Excel con **exceljs**, dependencia nueva cargada bajo
  demanda) + la UI en HRModule (`renderPlanillaLista` / `renderPlanillaEditor`,
  estados `payVista`/`payDraft`/`payAbiertos`/`payNuevo`…). Calca el Excel
  "Para revisión 1Q 10.26" de Carolina (GEO STRUCTURES = Geotecnica):
  **ordinario = mensual/2** en quincena completa (NO diario×días: la 2Q tiene
  16 días; alta/baja a mitad → diario×días con tope mensual/2; el diario se
  multiplica SIN redondear, como =J/30), bonificación = mensual/2, feriado
  trabajado (TF) +2 diarios, domingo (DT) +1 / DT2 +2, NSP −1 diario,
  llegada tarde denegada proporcional, INC y V pagan completo. **Deducciones
  de ley SOLO en la 2Q**: IHSS cuota fija 595.16 (permanentes y temporales),
  RAP = (mensual − 11,903.13) × 1.5 % (Geotecnica permanentes; `emp.sinRap`
  exime), ISR = lo que manda el contador (`emp.isrMensual`, editable en la
  línea y se RECUERDA en la ficha al guardar). **Cooperativa se descuenta
  TODAS las quincenas** (así va en la hoja de Carolina). **Honorarios**:
  quincenales con ISR 12.5 % sobre lo que cobran; `emp.honorariosPago =
  "mensual"` cobra el mes completo en `emp.honorariosQuincena` (default 1Q)
  y no entra en la otra (pill en la línea, se recuerda). **HORAS EXTRAS de la
  quincena ANTERIOR** (quincena vencida: 1Q oct paga HE de 2Q sep) entran
  como ingreso por colaborador (`horasExtrasDe` sobre hr-he con
  `heHoraBase`, que respeta el ajuste de salario base de HE) — con la data
  real de oct-2026 dio L 38,860.41, EXACTO el "HE" del Excel de Carolina.
  **Planilla de HORAS EXTRAS APARTE (20-oct-2026, Gerson: "que la planilla
  de horas extras sea por aparte, no en la misma")**: el neto de salarios
  (`totalesLinea().neto`, `resumenPlanilla().neto`) YA NO incluye HE;
  `heMonto`/`res.he`/`hePersonas`/`hePorMetodo`/`totalGeneral` van aparte y
  el registro guarda `total` (salarios) + `totalHe`. En el editor, dos
  tarjetas arriba "Planilla de salarios" / "Planilla de horas extras"
  (`payParte`); la de HE (`renderHeParte`) lista por colaborador las bandas,
  hora base, horas, monto y método de pago. PDF y Excel salen en archivos
  SEPARADOS (`parte: "salarios" | "he"` en construir/exportar*;
  `Planilla_Horas_Extras_<empresa>_<Q>_<periodo>`). Regla de siempre: la
  planilla de la 2Q paga las HE de la 1Q del mismo mes; la 1Q, las de la 2Q
  del mes anterior. Al 20-oct no existía hoja de HE de la 1Q oct (Gerson ya
  tenía un borrador de 2Q oct guardado SIN HE): cuando la carguen, "↻ Releer
  asistencia" la trae.
  **INCAPACIDAD (30-oct-2026, Gerson — caso Uriel)**: los primeros 3 días
  SEGUIDOS de una incapacidad los paga la empresa completos; desde el 4º paga
  el IHSS y la empresa solo reconoce el 34 % → deducción `descuentoIncap` =
  días × 66 % × diario (`INC_DIAS_EMPRESA`, `INC_PCT_EMPRESA`; solo salario,
  la bonificación no se toca). La racha cuenta días calendario: un domingo o
  feriado en "1" EN MEDIO de la incapacidad sigue en ella, y la racha viene
  de la quincena anterior (`rachaIncapAlCierre` → `ctx.incPrevias`). Línea:
  `diasIncapIhss`; fila "Incapacidad · N días al 34 %" en el editor, columna
  "Incapacidad (L)" en el Excel y dentro de "NSP/tarde/inc." en el PDF. ⚠
  Costos MO (calcCostoMO) sigue contando INC = día completo.
  Cada línea admite **extras** `[{id, tipo ingreso|deduccion, concepto,
  monto}]` (lo que ella escribía en OTROS INGRESOS/OTRAS DEDUCCIONES con
  nota), `metodoPago` transferencia|cheque|ach (se recuerda en la ficha; el
  cierre suma por método, como su "CK/ACH") y `nota`. Registro en `hr-pays`
  v3: `{id, company, periodo, quincena, estado borrador|publicada, lines,
  heDe, total, count, date, createdBy, updatedAt/By, publicadaAt/Por}`;
  `lineaParaGuardar` sigue llenando so/o1/otros/tDed/neto para lo viejo
  (`totalesLinea` también suma líneas v2). Guardado getCloud → reemplazar por
  id → set → verify; `recordarEnFichas` escribe isrMensual/metodoPago/
  honorariosPago en hr-emps5 solo si cambiaron. Pantalla: lista de planillas
  (filas de vidrio por año, chip Borrador/Publicada, Eliminar solo admin) +
  tarjeta "Siguiente: …" con mes/1Q-2Q; editor = avisos (asistencia leída o
  "sin asistencia: se paga completa", HE de X, llegadas tarde sin decidir →
  pestaña, 1Q/2Q), 6 tiles, buscador + pista por tipo + Expandir todo, UNA
  FILA DE VIDRIO por colaborador (días · ordinario · ingresos · deducciones ·
  neto) que se despliega en Ingresos (bonif editable, feriados, domingos, HE,
  extras +Agregar) · Deducciones (NSP, tarde, ISR editable en 2Q, IHSS, RAP,
  coop editable, extras) · Asistencia/HE/método de pago/nota; barra fija
  abajo: Excel · PDF · Guardar borrador · Publicar. "↻ Releer asistencia"
  regenera conservando extras/ISR/nota/método. `puedePlanilla` = admin y
  tesorería; los demás solo miran (Planilla sigue bajo el fieldset de solo
  lectura). Se RETIRARON PayrollGen, PayDetail, exportCSV/exportPrint y los
  modales pn/pd. PDF: tiles, tabla por tipo (ISR/IHSS/RAP solo en 2Q),
  totales por grupo, cierre por tipo / método / Salarios+HE=Total, firmas y
  hoja de Horas extras por banda; revisado como imagen con la réplica Node.
  **Excel con marca (30-oct-2026, Gerson: "viene toda blanca, fea; logos,
  naranja, bonita")**: logo de la empresa arriba a la izquierda (`logo` →
  `wb.addImage`, reducido a 240 px con `achicarLogo`; `LOGO_EMPRESA` se
  exporta de reporte-estilo), franja naranja bajo la cabecera, tiles
  Colaboradores / Total a pagar (naranja), bandas Colaborador · Ingresos ·
  Deducciones · A pagar sobre el encabezado carbón, títulos de grupo con
  tinte y filo naranja, filas alternadas, neto en naranja clarito, total en
  carbón con el neto naranja; Calibri (Helvetica Neue/Menlo no existen en
  Windows). Toda fórmula guarda su `result` (los visores de celular no
  calculan) + `fullCalcOnLoad`. Misma estética en Horas extras y Resumen.
  Excel: hoja Planilla (encabezado carbón, formato "L" #,##0.00, subtotales
  y total con SUM, columnas ISR/IHSS/RAP ocultas en 1Q, congelado), Horas
  extras y Resumen. ⚠ Diferencias ficha vs Excel de Carolina detectadas el
  16-oct (NO se tocaron): bonificaciones Ester 10,000 vs 4,000 (+6,000 era
  un bono extraordinario), Josué Manuel 1,977 vs 2,000, Marvin 2,959 vs
  3,000, Nacho 1,019 vs 1,000, Teófilo 1,980 vs 2,000, coop Nelson 1,056 vs
  1,294.50, Mauro salario 0 vs 54,000; honorarios mensuales según ella:
  Arturo, Gustavo, Mauro, Melissa y Oscar.
  **HUB DE RRHH (20-oct-2026, pedido de Gerson: "un hub de RRHH para todos:
  ver su asistencia de GeoClock, pedir vacaciones, permisos, constancias y
  reportar problemas; Ana carga por la gente de campo y yo apruebo; que
  quede en la ficha")**: `src/rrhh-solicitudes.js` (lógica PURA,
  `tests/rrhh-solicitudes.test.mjs`) + `src/rrhh-hub.jsx` (pantallas a
  nivel de módulo) + integración en HRModule. TODOS los roles entran a
  GeoTeam (MODULES en App.jsx, menos la tablet `marcaje`): los que NO son de
  RRHH (`esPortalSolo`: residentes, Fernando, Arturo, visores…) ven SOLO la
  pestaña **Mi RRHH** (`PortalRRHH`): tarjeta con su ficha, cajas de vidrio
  Mi asistencia (`MiAsistencia`: marcajes de GeoClock por quincena —entrada
  primera / salida última / horas con almuerzo / tarde con la decisión de
  RRHH— leídos con getCloud de `gc-marks-*`) · Vacaciones (días tomados este
  año) · Permisos · Constancias · Reportar un problema, y "Mis solicitudes".
  Los de RRHH ven además la pestaña **Solicitudes** (`BandejaRRHH`:
  contadores por tipo que filtran, Por decidir / Decididas / Todas, buscador,
  "+ Nueva solicitud") con los REGISTROS de siempre abajo (Vacaciones ·
  Permisos · Constancias → `renderVacs/renderLvs/renderCons`, que dejaron
  de ser pestañas) y "Mi RRHH" al final. Badge naranja en la pestaña y en
  el Panel (`badges.rrhh`, solo admin/tesorería/Ana) con lo que tienen por
  decidir y no cargaron ellos. **Usuario ↔ ficha** (`vincularEmpleado`):
  `gt-vinculos` {username: empId} > `empId` de la sesión (accesos de
  GeoTeam) > nombre (todas las palabras del label, sin títulos, en UNA
  ficha; el exacto gana); si no se encuentra o es ambiguo, el portal ofrece
  "Elegir mi ficha" (self-service, se guarda en gt-vinculos). Cualquiera
  puede pedir **en nombre de otra persona** (queda `solicitadoPor` +
  `enNombreDe`). Key **`hr-solicitudes`** `[{id, folio RH-AAAA-NNNN, tipo
  vacaciones|permiso|constancia|reporte, empId, empNombre, company, cargo,
  solicitadoPor {username, nombre}, enNombreDe, estado pendiente|en_revision|
  aprobada|resuelta|denegada|cancelada, nota, adjuntos [{fileId…} en
  cp-file-*: foto comprimida o PDF ≤2 MB], historial[], decision {por, at,
  motivo}, resultado, …campos del tipo}]`; se escribe SIEMPRE getCloud → fn
  → set → verify (`sSol`). **Deciden** admin, tesorería y Ana (`puedeDecidir`:
  nunca el que la cargó; la constancia DE TRABAJO lleva salario → solo
  Gerson/Carolina). **Al aprobar**: vacaciones → `hr-vacs` (anexar con
  getCloud) + `syncVacacion` (marca "V"); permiso → un registro por día
  hábil en `hr-lvs` + marca 1/0; constancia → `hr-cons` + `resultado.doc`;
  reporte → "Tomar en revisión" / "Responder y resolver". La ficha (dorso
  del carnet) muestra **Vacaciones tomadas** (`vacacionesTomadas`).
  **CONSTANCIAS calcadas de la que Gerson firma** (`constanciaDoc`, doc con
  runs en negrita + tabla; `ConstanciaVista` en pantalla y `constanciaPDF`
  carta con `escribirRuns`): "CONSTANCIA DE TRABAJO", "el señor/la señora
  NOMBRE EN MAYÚSCULAS, identificado con el número de identidad …, labora
  para la empresa <razón social> desde el dos (02) de julio de dos mil
  veinticinco (2025)…", cargo, modalidad por `contractType`, salario en
  letras (`lempirasEnLetras`), tabla Salario mensual · (−) IHSS 595.16 ·
  (−) RAP (solo Geotecnica permanentes) · Salario neto, cierre "a los siete
  (07) días del mes de … del año …" y firma "Lic. Gerson Trochez ·
  Coordinador de Operaciones · <razón social>". `EMPRESAS` trae razón
  social y logo por empresa: Subterra = "SUBTERRA, S.A." (logo
  `public/brand/subterra.png`, el redondo que mandó Gerson el 20-oct) y
  Geotecnica = "GEOSTRUCTURES, S.A. DE C.V." (razón social confirmada por Gerson el 20-oct;
  logo horizontal `public/brand/geotecnica.png`). Tipos: `trabajo` (con
  salario) y `laboral` (sin el párrafo del salario). El PDF va en **Times,
  JUSTIFICADO** (`tokensDe`/`escribirRuns`: una palabra puede mezclar
  normal y negrita, ej. "FERNÁNDEZ," con la coma sin negrita; jsPDF no
  mezcla fuentes en un renglón solo) y tabla con bordes grises, calcado del
  Word de Gerson. jsPDF no trae "−": `l1()` normaliza guiones al pintar.
  **Portal a lo ancho (20-oct, 2ª pasada)**: perfil con foto grande a la
  izquierda y 2+2 cajas (Mi asistencia · Vacaciones / Permisos ·
  Constancias) a la derecha, "Reportar un problema" como fila delgada, y
  abajo "En trámite" e "Historial" por separado. **Mi RRHH es la PRIMERA
  pestaña y la de entrada para TODOS** (incluidos admin y tesorería). Las
  cajas Vacaciones / Permisos / Constancias abren una sub-vista con el
  HISTORIAL de la persona (hr-vacs / hr-lvs / hr-cons agrupados por año,
  tiles, "Descargar PDF" en las constancias que salieron de una solicitud)
  y el botón "+ Pedir…" (Gerson: "si dice 5 días tomados, ¿dónde los veo?"). Probado el 20-oct con solicitudes de prueba de Fernando
  (borradas después): vacaciones 2030 aprobadas → hr-vacs + carnet; constancia
  aprobada → vista previa y PDF iguales al modelo.
  **HUB DE ASISTENCIA (23-oct-2026, Gerson: "asistencia, llegadas tardías
  y horas extras juntos en un solo apartado tipo Solicitudes; misma
  estética, sin tantos colores ni texto, nada de emojis; y que ahí viva
  GeoClock")**: las pestañas Asistencia · Llegadas tardías · Horas Extras
  se volvieron UNA pestaña **Asistencia** (`renderAsistenciaHub`, estado
  `asisSub` "" | hojas | tardanzas | he) con cajas de vidrio: Asistencia
  (quincenas con cuadrilla / última hoja) · Llegadas tardías (badge = por
  decidir de la empresa activa, también en la pestaña) · Horas extras
  (última hoja, horas y L) · GeoClock (entradas de hoy; abre el módulo vía
  `onAbrirModulo("geoclock")`, prop nueva de `moduleProps` en App.jsx).
  Cada caja abre la sub-vista con "←". Los atajos viejos (Dashboard
  "pendientes", avisos de Planilla) pasan por `irA(id)` / `tieneSec(id)`
  (`SUB_ASIS` traduce attendance/tardanzas/horasextras). Oscar
  (`isOscarTardies`) solo ve la caja de tardanzas. Helpers de vidrio del
  componente: `btnH`, `chipH`, `pillH`, `tileH`, `IcoH`, `CTRL_H`,
  `cabeceraSub`. **Listas** (`renderAtts`, `renderHE`): una fila de vidrio
  por quincena (1Q/2Q grande + mes, colaboradores · proyectos con chips,
  Registrada / Sin registrar, Asistencia · Cuadrilla · ✕). **Llegadas
  tardías** (`renderTardanzas`): tiles por decidir / aprobadas / denegadas /
  colaboradores, pills de estado, selects de colaborador y quien decide,
  archivo (Recientes · mes · fecha), y una fila de vidrio por tardanza
  (avatar, hora en mono, chip "+N min", "decide Ana", chip de estado,
  explicación entre comillas, descuento en una línea, Ver foto · Ver firma ·
  Denegar · Aprobar · Revertir · Borrar). La lógica (aprobar/denegar/
  revertir/borrar, responsables, archivo) NO cambió. **Hojas** (`AttendanceGrid`
  / `HorasExtrasGrid`): encabezado de vidrio con leyenda, aviso de NSP con
  acento naranja, resumen en tiles, cada proyecto en un contenedor de vidrio
  con cabecera clara (ya no la barra de color de la empresa), encabezados de
  tabla neutros (`TH_H`/`TD_H`, D y F en naranja) y UNA paleta corta de
  celdas (`PAL_CELDA`: verde presente · gris descanso pagado · rojo NSP ·
  ámbar incapacidad · azul vacaciones · naranja TF/DT/DT2 · gris bloqueado;
  el 1* no cambia de color, lo dice el rótulo). Bandas de HE en grises
  (`HE_BANDAS`), totales en carbón/verde, botones Cerrar · PDF · Guardar
  (`gt-btn`). La lógica de las grids (ciclo de celdas, overrides, horas de
  entrada, NSP sugeridos, guardado) quedó INTACTA.
- `GeoClockModule.jsx` **rediseño GeoCore (23-oct-2026)**: monta GT_CSS +
  brillos; encabezado con logo, ícono, "GeoClock" y las ubicaciones que
  cubre la tablet, reloj en mono, pills Registros · Módulos · Salir; búsqueda
  "Marcá tu asistencia" con tarjetas de vidrio (foto, nombre, cargo, Entrada
  7:55 / Sin marcar hoy); pantalla de la persona con tarjeta de identidad
  (horario y tolerancia, chip "Marcás en Plantel/Administración"), botones
  segmentados Entrada / Salida (carbón), aviso de tarde con acento naranja,
  **cámara + firma lado a lado** y el botón grande naranja "Registrar
  entrada · 8:02"; confirmación con círculo verde (o naranja si fue tarde).
  Sin emojis en ninguna pantalla (también Registros). **FOTO AUTOMÁTICA**
  (`CamaraMarcaje`, a nivel de módulo): `getUserMedia` frontal con vista
  previa espejada; al registrar, `camRef.current.capturar()` saca un JPEG de
  320 px (~10-25 KB) que se guarda en **`gc-foto-<markId>`** ANTES del
  marcaje (si no se puede subir, no se registra nada, igual que la firma);
  el mark lleva `fotoId` o `sinFoto: true` (sin cámara o sin permiso el
  marcaje sigue: la foto es evidencia, no candado). La foto se ve en el
  detalle del marcaje (Registros) y en "Ver foto" de Llegadas tardías.
  **UBICACIÓN POR PERSONA** (`src/geoclock-calc.js`, pura, con
  `tests/geoclock-calc.test.mjs`): la tablet de la pared (`marcaje`) lleva
  `ubicaciones: ["ADMINISTRACIÓN", "PLANTEL"]` en users.js; `ubicacionDeMarcaje
  (tablet, emp, asignacionCuadrilla)` decide: la cuadrilla de la quincena
  si coincide con una ubicación de la tablet → si no, departamento
  Administración/Contabilidad/RRHH → ADMINISTRACIÓN → el resto PLANTEL
  (una tablet de una sola ubicación siempre estampa esa). `UBICACIONES_TABLET`
  (para los NO MARCÓ de Registros) une `ubicacion` + `ubicaciones`.
  **4ª pasada (23-oct, "no me convence; los botones en otra posición que el
  resto de GeoTeam; Registros es un chorizote")**: encabezado IGUAL al de
  GeoTeam/GeoInventory (← en círculo · logo · ícono · GeoClock | usuario +
  ubicaciones · Cerrar sesión) y debajo PESTAÑAS Reloj · Registros (salir y
  Registros siguen pidiendo la clave en el kiosco). Reloj a todo el ancho:
  fichas a la izquierda y a la derecha un panel de vidrio de ALTO COMPLETO
  (fecha, reloj 62 px, "Marcá tu asistencia", 3 contadores entradas /
  salidas / tarde y "Últimos marcajes" con scroll). **Registros sin
  texto**: se retiraron el párrafo y la leyenda "Cómo leer"; una barra de
  vidrio (Hoy · Esta semana · Este mes · rango · colaborador · proyecto ·
  Marcaje manual · CSV · PDF), 4 tiles, y por proyecto una lista en grilla
  (Fecha solo si el rango es de varios días · foto + nombre · Entrada con
  chip "+N min" · Salida + comentario · Horas · Estado: Completo / En
  jornada / Sin salida / Sin entrada / No se presentó). Brutas y almuerzo
  pasaron al tooltip de Horas; "manual" / "editada" van en chiquito junto a
  la hora; un ausente muestra "—" + "+" (el Estado ya lo dice). Una nota de
  una línea al pie.
  **5ª pasada (23-oct, "demasiados cuadritos, me cansa la vista")**: las
  personas del reloj ya NO van en tarjetas: foto REDONDA de 62 px, nombre y
  hora debajo, sin caja (`.gc-persona`: fondo solo al pasar o tocar); un
  anillo verde (a tiempo) o naranja (tarde) alrededor de la foto de quien
  ya marcó. El panel del reloj y los últimos marcajes siguen a la derecha.
  **2ª pasada del mismo día**: GeoClock lleva `oculto: true` en MODULES (se
  abre desde GeoTeam → Asistencia; la tablet `marcaje` lo sigue viendo porque
  `availableModules` cae a TODOS los permitidos cuando no queda ninguno
  visible). `onAbrirModulo` guarda el módulo de origen (`origenModuloRef` en
  App) y el `onBack` del módulo abierto vuelve AHÍ (el botón dice "← GeoTeam",
  prop `volverA`); GeoTeam recuerda `sec`/`asisSub` en sessionStorage
  (`gt-hr-sec`, `gt-hr-asis`) para caer otra vez en Asistencia. La lista de
  personas del reloj son FICHAS de foto (64 px, nombre corto en 2 líneas,
  punto verde/naranja con la hora o "Sin marcar"), con pills de ubicación
  (Todos · Administración · Plantel, solo si la tablet cubre varias) y un
  índice A–Z; al escribir se filtra como siempre. **Modo liviano**
  (`gt-liviano` en GT_CSS: vidrio sólido, sin brillos ni transiciones) en
  las tablets kiosk y en equipos con ≤4 núcleos o ≤4 GB — las Honor/Xiaomi
  se trababan con el desenfoque. El aviso de NSP sugeridos de la hoja quedó
  en UNA línea ("Sin marcaje en GeoClock · N" + chips + botón; la explicación
  va en el tooltip).
  **3ª pasada (23-oct, "aprovechemos el ancho y la tablet; la hora grande
  en un cuadradito a la derecha")**: la búsqueda del reloj es a DOS
  columnas desde 1000 px (`ancho` por `resize`): izquierda buscador +
  filtros + fichas (112 px, foto 56); derecha una tarjeta de vidrio
  pegajosa con la fecha en mayúsculas chicas, el reloj corriendo (58 px,
  segundos en naranja), "Marcá tu asistencia", "Hay que dar el mejor de los
  esfuerzos hoy." y el conteo de entradas/salidas del día + quincena +
  ubicaciones. En la tablet en vertical la misma tarjeta va ARRIBA como
  franja (texto a la izquierda, reloj a la derecha). El reloj del
  encabezado solo aparece fuera de la búsqueda (compacto).
  **Dashboard gerencial + KPI's (ago 2026, estilo IsTeam)**: `renderDashboard`
  reescrito — `statsDeMes(periodo)` calcula presencia diaria/NSP/INC/VAC/costo
  MO por proyecto desde hr-atts2 (calcCostoMO) + planilla real (hr-pays) +
  tardanzas GeoClock. Selector multi-mes (`dashMeses`, chips toggle → tabla
  comparativa + líneas superpuestas). Gráficos SVG puros a nivel de módulo:
  `GTLineChart`/`GTDonut`/`GTMonthBars` (tooltips nativos `<title>`). Pestaña
  KPI's (`renderKpis`, `kpisMes` con ‹›): headcount, masa (planilla real
  dorada vs proyección roster azul en GTMonthBars, click en barra = ver mes),
  ausentismo, tardanzas, rotación (hr-movs bajas), vacaciones año, antigüedad,
  estructura por género (campo `sexo`) + stacked por depto. Ana NO ve
  dashboard/kpis; hideSalary gatea montos por si acaso.
  **Ficha: sexo + horario (ago 2026)**: `emp.sexo` (masculino/femenino, KPI
  estructura) y `emp.horario` (plantel 7-16 / oficina 8-17 / especial 9-18 /
  custom con horarioEntrada/horarioSalida). Helpers exportados: `HORARIOS`,
  `TOLERANCIA_MIN` (10), `horarioDe(e)`, `horaEntradaH(e)` (default plantel
  7:00), `hoyTegus()`, `gcMarkKey`, `quincenaAnterior` — GeoClock los importa.
  **Fórmula proporcional GENERALIZADA (ago 2026)**: se quitó el gate
  `payByHour` en planilla y calcCostoMO — cualquier `arrivalTimes[k]`
  descuenta, con base `horaEntradaH(emp)` (antes 7 fijo) y TOPE 8h (nunca más
  que el día). dayValueFor de la grid igual (piso 0). FIX crítico: PayrollGen
  L~1010 usaba `sheet?.arrivalTimes` (variable inexistente — ReferenceError
  desde may 2026; generar planilla estaba roto y nadie lo notó porque hr-pays
  está vacío) → `attSheet?.arrivalTimes`.
  **Llegadas tardías (`renderTardanzas`)**: marca tarde de GeoClock sin
  decisión = pendiente. Aprobar → gc-tardies {estado:"aprobada"} (día
  completo). Denegar → `marcarTardanzaEnAsistencia` fija la hora real en
  arrivalTimes de la hoja (merge getCloud + verify; ABORTA sinNube; sinHoja =
  ok, initialData la siembra al crearla) + decisión "denegada". Revertir
  limpia la hora pero CONSERVA el registro con estado "pendiente" +
  `historial` (array de {accion, por, fecha, at} — cada aprobación/
  denegación/reversión queda registrada en el cuadrito). `sGcTardies` opera
  por DELTA ({upsert}|{remove}) contra getCloud. Firmas on-demand
  (`firmaCache`). **Responsables (18-ago)**: `responsableDe(mk)` por
  mark.registradoPor — "Oscar Paz" → Oscar decide; "Ana Vasquez"/"Marcaje de
  Asistencia" → Ana; otros → solo supers (admin, coordinador, tesoreria =
  Lic. Carolina). Todos visualizan; botones gateados por `puedeDecidir`.
  Filtros: estado (chips) + colaborador + responsable (tardEstado/
  tardPersona/tardResp) + ARCHIVO por mes o fecha exacta (tardMes/tardFecha
  — un useEffect carga de la nube las quincenas del período elegido; default
  "Recientes" = quincena actual + anterior). Las Decididas se agrupan en
  carpetas mensuales (📁 mesLabel). Botón 🗑 Borrar SOLO para Gerson
  (`puedeBorrarTardanza` por userName): elimina el marcaje de su key
  gc-marks, vacía la firma, borra la decisión y limpia la hora si estaba
  denegada (para pruebas/errores). Ana y Oscar (`isOscarTardies`, rol
  logistica: SOLO esta pestaña en GeoTeam) tienen hideSalary — no ven el
  monto del descuento.
  **Marcajes → asistencia**: initialData siembra "1" por cada ENTRADA de
  GeoClock (solo celdas vacías) y `initialArrivals` siembra la hora de
  tardanzas DENEGADAS; `openGrid` es async y refresca los marks
  (`refreshMarksFor`) antes de abrir. loadAll carga gc-tardies + marks de la
  quincena actual y la anterior (`gcMarks` {periodo|Q: [...]}).
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
  **Botón de ficha en el KANBAN (19-ago-2026)**: el bloque de subir ficha
  firmada vivía SOLO en la card de "Entregados" (`renderCardEntregado`), así
  que Oscar no tenía cómo subirla antes de marcar entregado y el candado lo
  dejaba trabado. Ahora `renderCardDespacho` (la card del kanban) lleva
  "📎 Ficha de recibido (obligatoria)" con ids `kf-ficha-<id>` + aviso rojo,
  y muestra "✓ Ficha subida" cuando ya está.
  **Candado de ficha (19-ago-2026)**: `fichaBloqueaEntrega` — un despacho con
  `sourcePurchaseId` (source "compra" o "maquinas") NO se puede marcar
  entregado/cerrado sin la ficha de recibido subida (o la compra cerrada sin
  ficha: servicios/renta). Aplica en `updateDespachoEstado` y en `saveDespacho`
  (solo si el estado anterior no era ya entregado). EPP y manuales no se tocan.
  Si la nube no responde, BLOQUEA (no se asume que hay ficha). Logística ahora
  carga también `mq-purchases` (state `mqPurchases`, load + focus-refresh) y
  `sourcePurchase` se resuelve de ambas listas — sin eso los despachos de
  GeoMachinery no mostraban el botón de subir ficha y el candado los dejaba sin
  salida. `uploadFichaFirmada` usa `purchKey` dinámico en pre-fetch, save Y
  **verify** (el verify quedó hardcodeado a cp-purchases en el primer intento:
  toda ficha de maquinaria reportaba "VERIFICACION FALLO" aunque sí se
  guardaba — lo cazó la revisión adversarial).
- `GeoClockModule.jsx` (GeoClock, ago 2026) — marcaje entrada/salida en tablet
  (Oscar plantel central, Ana oficina; roles: admin, coordinador,
  tesoreria, asistente_compras, logistica, marcaje). Reloj vivo TZ **America/Tegucigalpa** vía
  Intl (`ahoraTegus()` — NUNCA hora local del dispositivo). El colaborador
  busca su nombre (activos de ambas empresas), firma en canvas
  (`SignaturePad` a NIVEL DE MÓDULO, export JPEG ~10KB — PNG pesaba 180KB y
  llenaba localStorage) y registra ENTRADA/SALIDA. Tolerancia
  `TOLERANCIA_MIN` sobre `horarioDe(emp).entrada`; pasado eso: "Llegaste
  tarde 😞" + explicación OBLIGATORIA → pendiente en gc-tardies (la decide
  RRHH). Domingos/feriados NUNCA son "tarde" (se pagan por ley). **CANDADO**:
  sin cuadrilla hr-cuad de company|periodo|quincena ACTUAL no se marca
  (obliga a armar la cuadrilla el día antes de la quincena). Guardado:
  firma primero (`gc-firma-<id>`), luego mark a `gc-marks-<periodo>-<Q>` con
  getCloud (throw → abort con alert) + union por id + verify + 1 retry
  (carrera de 2 tablets). Anti doble-marcaje por día. Kiosk: reset a
  búsqueda tras 120s (persona) / 7s (confirmación); refresh en window focus.
  Shape mark: {id, empId, empNombre, company, fecha, hora "H:MM" 24h SIN
  cero inicial (= formato arrivalTimes), min, tipo, tarde, minTarde,
  horarioEntrada, explicacion, comentario (opcional, solo salidas — ej.
  "salgo del plantel a proyecto"), firmaId, registradoPor, ts, createdAt}.
  **Vista Registros (18-ago-2026)**: reporte de entradas/salidas dentro de
  GeoClock (botón 📋 en el header, visible a todos los roles del módulo).
  Filas por colaborador+día agrupadas por proyecto (asignación de la
  cuadrilla de esa quincena, fallback emp.project); entrada = primera del
  día, salida = última; brutas = salida−entrada; ALMUERZO 1h se descuenta
  SOLO si la jornada cruza el mediodía (entrada ≤12:00 y salida ≥13:00);
  laboradas = brutas − almuerzo. Filtros: presets Hoy/Semana/Mes + rango
  libre (tope 120 días), persona y proyecto. Export CSV (BOM, Excel) y
  PDF imprimible sin emojis. Carga por getCloud de todas las quincenas del
  rango (quincenasDeRango). Tolerancia subida a 15 min (TOLERANCIA_MIN en
  HRModule — aplica a reloj, ficha y tardanzas a la vez).
  **NO REQUIERE MARCAJE (24-ago-2026)**: `emp.noMarca` (checkbox en la ficha,
  bloque azul junto a payByHour) — para jefaturas y personal que no marca en la
  tablet. Efectos: NO sale en la lista del reloj (`activos` lo filtra), NO
  genera fila de ausente "NO MARCÓ" en Registros, y NO se le sugiere NSP en el
  banner de la hoja de asistencia (`nspSugeridos`). Su día se maneja normal en
  la hoja de GeoTeam.
  **Tablets con UBICACIÓN + ausentes en Registros (21-ago-2026, caso José
  Miguel)**: cada tablet es una sede — `ubicacion` en users.js (oscarpaz =
  PLANTEL, marcaje = ADMINISTRACIÓN; una tablet de proyecto futuro = usuario
  role "marcaje" con ubicacion = short del proyecto). GeoClock estampa
  `mark.ubicacion` al marcar. En Registros, los ACTIVOS asignados por
  cuadrilla a una sede con tablet que no marcaron en un día CERRADO donde la
  tablet sí operó aparecen como fila NO MARCÓ/NO MARCÓ con sus ➕ de marcaje
  manual (`proyectoConTablet`, matching sin acentos por `includes`). Si nadie
  marcó ese día, no se inventa nada.
  **Corrección manual + NO MARCÓ (18-ago-2026, caso Ariel)**: el día cierra
  11:59 PM — en días CERRADOS la celda sin marca muestra badge rojo
  "NO MARCÓ"; regla de negocio: día cerrado SIN ENTRADA = NO SE PRESENTÓ
  (el reloj no fabrica filas de ausentes; el NSP se marca en la hoja de
  GeoTeam). `puedeCorregir` (admin/coordinador/tesoreria/asistente_compras =
  Gerson, Carolina y Ana; Oscar y marcaje NO) habilita: ➕ en la celda
  NO MARCÓ (modal precargado), botón global "✍️ Marcaje manual" (morado) y
  🗑 SOLO sobre marcas manuales (confirm con la justificación original).
  Mark manual: {manual:true, tarde:false, firmaId:null, justificacion,
  editadoPor, historial:[{accion:"entrada/salida colocada MANUALMENTE (el
  colaborador no marcó)", por, justificacion, fecha, at}]} — justificación
  OBLIGATORIA (≥3 chars), dup-check empId+fecha+tipo contra getCloud, badge
  morado "MANUAL" en Registros (tooltip: quién + por qué), la justificación
  sale en CSV (columna "Manual / Justificacion") y PDF ("(manual)" + nota).
  Los manuales siembran asistencia igual que un marcaje normal (initialData
  filtra por tipo==="entrada") y al ser tarde:false jamás generan tardanza.
  Si funciona en plantel esta quincena, la siguiente se agrega a proyectos.
  **EN USO REAL desde el 19-ago-2026** (10+ marcajes/día en plantel y oficina).
  **Minutos tarde desde la TOLERANCIA (19-ago-2026, pedido de Gerson)**: el
  atraso se cuenta desde que VENCE la tolerancia, no desde la hora de entrada
  — horario 8:00 + 15 min → marcar 8:20 son **5 min tarde** (antes decía 20).
  Helpers en HRModule: `horaLimiteH(e)` (= horaEntradaH + TOLERANCIA_MIN/60) y
  `minTardeDe(hora, horarioEntrada)`. Aplicado en TODO lo que cuenta atraso:
  reloj (mensaje + mark.minTarde), Registros, descuentoDe de tardanzas,
  PayrollGen, dayValueFor y calcCostoMO. Los marcajes viejos se RECALCULAN al
  vuelo desde hora+horarioEntrada (no se migran datos).
  **Detalle/edición de marcaje (19-ago-2026)**: en Registros la hora es
  clickeable → modal con datos, puntualidad, explicación, decisión de RRHH,
  firma e HISTORIAL. `puedeCorregir` habilita "✏️ Corregir este marcaje":
  cambia hora (y comentario en salidas) con justificación OBLIGATORIA, recalcula
  tarde/minTarde, avisa si el marcaje deja de ser (o pasa a ser) tardanza, y
  todo queda en `historial` [{accion, por, justificacion, fecha, at, antes}].
  Guardado con getCloud + verify. Chips: tarde APROBADA verde / DENEGADA rojo /
  pendiente ámbar (GeoClock LEE gc-tardies, sigue sin escribirla), MANUAL morado,
  ✎ con cambios. Leyenda "CÓMO LEER" arriba de la tabla; CSV con columna
  "Estado tardanza" y PDF con el estado en color.
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
- `GeoCostModule.jsx` (**GeoCost — Central de Costos por Proyecto, 9-sep-2026**)
  + `geocost-calc.js` (lógica PURA, sin React ni store) + `geocost-pdf.js`
  (Ficha de proyecto y Reporte de costos con jsPDF) + `geocost-forms.jsx`
  (PresupuestoForm / MovilizacionForm / MovilizacionDetalle / AjustesTasa, a
  nivel de módulo) + `geocost-ui.jsx` (primitivas Input/Select/Btn/Chip/
  Modal/Vidrio + fmtUSD/fmtL/fmtFecha + colores C_*). Roles: admin, costos,
  tesoreria, gerencia (solo lectura), compras_ops (16-sep-2026: Arturo entra
  SOLO para cargar/editar presupuestos — ver más abajo). Modelo APROBADO por Gerson tras 10
  preguntas de descubrimiento (no re-litigar): presupuesto en **USD** (así lo
  pasa el PM), compras en L, UNA tasa global editable en el módulo
  (`cc-config.tasa`, hoy 27.00; el chip "L 27.00 / $" del header la abre);
  solo proyectos NUEVOS empezando por VILLA SAN MIGUEL (presupuesto cargado
  el 9-sep con la `PLANTILLA_VILLA_SAN_MIGUEL`: 14 partidas = $175,075.32);
  **Comprometido** = solicitud `validado`, **Ejecutado** = `pagado|finalizado`;
  repuestos caen al proyecto de la solicitud (partida por defecto la de
  módulo `maquinas`); mano de obra BRUTA con la fórmula de GeoTeam
  (`calcCostoMOPuro` es PORT FIEL de `calcCostoMO` + HE quincena vencida —
  `horaLimiteH`/`HORARIOS`/`TOLERANCIA_MIN`/`hoyTegus` están DUPLICADOS como
  espejo para que Node pueda testear el archivo: **si cambian en HRModule,
  cambiar acá**); sin cargas patronales, sin contrato marco, sin avance
  físico (los reportes solo muestran % del presupuesto consumido). La Central
  NO duplica registros: compras/repuestos/MO se leen en vivo (SOLO
  `store.getCloud`, nunca `store.get`) y se clasifican por `partidaId`; lo
  único propio son presupuestos, movilizaciones y la tasa.
  **Partidas**: `{id, categoria (6 del PM: Generales, Materiales, Personal,
  Equipos, Servicios subcontratados, Otros), nombre, unidad, cantidad, pu,
  monto, modulo}` con `modulo` ∈ compras | maquinas | mo | movilizacion |
  libre (libre aparece en compras Y máquinas). `monto = cantidad×pu` si ambos
  > 0. Lo que no tiene partida cae a **"Por clasificar"** (cuenta en los
  totales del proyecto, no en ninguna partida); reclasificar (admin/costos/
  tesoreria) escribe `partidaId` + audit `partida_reclasificada` en
  cp-/mq-purchases con getCloud → map por id → set → verify (nunca el array
  local).
  **Movilizaciones** (pestaña propia; solo Gerson crea la "Solicitud de
  fondos" como el correo: origen → destino, renglones Combustible/Peajes/MO
  conductor/Imprevistos, total, "acreditar a"): Solicitada (gris) → Carolina
  **Recibida** (azul) → adjunta comprobante (`cc-file-<id>`) → **Acreditada**
  (verde). Solicitada/Recibida = comprometido; Acreditada = ejecutado.
  Cancelar/Eliminar solo admin con confirm (eliminar solo solicitada/
  cancelada). Código `MOV-YYYY-NNNN`.
  **Vistas**: Dashboard (tira KPI + tarjeta por proyecto con anillo carbón=
  ejecutado / naranja=comprometido y mini barras por categoría; carga animada
  `dashAnim` por [sec, loaded]; anillos/barras son FUNCIONES), Proyectos
  (cajitas → detalle con ficha, Por clasificar, partidas por categoría con
  barra doble, Movimientos con filtros y Select de reclasificación), botones
  **Ficha PDF** (réplica de la ficha que Gerson armaba a mano: solución,
  cliente, código, fechas, barra de duración, maquinaria, materiales
  recurrentes) y **Reporte PDF** (KPIs, tabla por partida, movimientos).
  Sobregiro NO bloquea: chips "80 % +" / "Sobregiro" (semaforoDe).
  **En GeoShopping/GeoMachinery** (solo cuando el proyecto tiene presupuesto
  activo — si no, el form es IDÉNTICO a antes): Select "Partida del
  presupuesto *" (optgroup por categoría; el `Select` local ganó soporte de
  `{group, options}`), línea "Disponible: $ · L", y si el monto (en USD a la
  tasa) supera el disponible → aviso naranja + `sobregiroJustificacion`
  obligatoria (≥ 5 chars). El módulo lee cc-presupuestos/cc-config best-effort
  con getCloud al cargar y en el refresh. DetailView muestra la partida.
  **Dashboard v2 (10-sep, "quiero gráficas de barras de TODOS los proyectos
  en la misma gráfica")**: tira KPI → fila `minmax(0,2fr) minmax(0,1fr)` con
  "Por proyecto" (barras VERTICALES agrupadas por presupuesto activo:
  presupuesto gris `GRIS_BARRA` · comprometido naranja · ejecutado carbón;
  eje Y con 4 guías y techo redondo `niceMax`; valores `fmtCorto` encima —
  se ocultan si la barra mide < 14px o choca con la vecina; click en el
  grupo abre el proyecto; > 6 proyectos scrollea horizontal DENTRO de la
  tarjeta) y "Por categoría" (barras dobles agregando `resumen.categorias`
  de toda la cartera, orden fijo `CATEGORIAS`); debajo "Gasto por mes —
  últimos 6 meses" (apiladas carbón+naranja sumando `resumen.porMes`) y las
  tarjetas por proyecto con anillo (Gerson: "me encanta") quedan igual.
  Helpers a nivel de módulo: `fmtCorto` ($ 850 · $ 31.5k · $ 175k · $ 1.2M),
  `niceMax`. Todo son FUNCIONES dentro del render con `dashAnim`/`reduceMotion`.
  **Dashboard v3 (11-sep, Gerson: "solo quiero 3, no más — el de barras, la
  ruedita por proyecto y el gasto por mes; la línea de Presupuesto/
  Comprometido/Ejecutado no hace falta porque solo es de San Miguel")**: UNA
  fila `minmax(0,1.35fr) minmax(0,1fr) minmax(0,1fr)` con `grafProyectos()` ·
  las tarjetas con anillo (una por presupuesto, apiladas en la columna del
  medio) · `grafMeses()` (H 200). Se RETIRARON la tira KPI, "Por categoría",
  `kpi()`, `cartera`, KPI_NUM/KPI_SUB e imports `resumenCartera`/`CATEGORIAS`
  del módulo. En tablet (768-1100px) las 3 columnas quedan apretadas — si
  Gerson lo ve en iPad, pasar a 2+1.
  **Movilizaciones con PROVEEDOR (11-sep)**: el botón es **"+ Registrar
  movilización"**; el form arranca con dos pills **De nosotros / Con
  proveedor** (`TIPOS_MOV` en geocost-calc; `mov.tipo` "propia"|"proveedor",
  registros viejos sin `tipo` = propia). Con proveedor: Proveedor* (datalist
  de `cp-providers`, texto libre), Monto L*, N° de cotización, y el bloque
  bancario se titula "Pagar a" pre-llenado con el proveedor; se guarda UN
  renglón "Servicio de movilización — <proveedor>" y `total = monto` para
  que `movimientosMovilizaciones`/resúmenes/PDF sigan igual; campos aditivos
  `tipo`, `proveedor`, `cotizacion` en cc-movilizaciones. Lista: chip
  "Proveedor" + "Pagar a: X"; filtro Todas · Nuestras · Con proveedor
  (`movTipo`); detalle muestra Proveedor/cotización en vez de Conductor.
  Gerson avisó que las movilizaciones se MUDARÁN a GeoLogistics cuando ese
  módulo se rediseñe (hoy viven acá a propósito).
  **Revisión adversarial aplicada (9-sep, 7 lentes + verificación cruzada)**:
  `sP` de AMBOS módulos RESCATA la reclasificación hecha en GeoCost antes de
  mergear (si la nube trae entradas de audit `partida_reclasificada` que la
  fila local no tiene, adopta `partidaId`/`sobregiroJustificacion` y suma esas
  entradas) — sin eso, el próximo pago de Carolina con la pestaña abierta
  desde antes borraba la partida en silencio y el verify semántico no lo veía;
  `cambiarEstadoMov` valida la transición contra el estado REAL de la nube
  (`DESDE_MOV`) porque los perms se calculan con el estado local del modal;
  `adjuntarComprobante` ya NO borra el `cc-file-*` si la falla fue del verify
  y la nube ya lo referencia; el tope de archivo es 2 MB (el empírico de
  cp-file-*, no 8); `fmtFecha` trata la medianoche UTC como fecha pura (paidAt
  salía un día antes en Honduras); `movimientosMO` deduplica hr-atts2 por
  company|periodo|quincena quedándose con `lastSaved` más nuevo (espejo de
  statsDeMes); partida huérfana (borrada del presupuesto) ya no pasa la
  validación ni finge sobregiro, y un presupuesto sin partidas elegibles para
  ese módulo NO bloquea el form; `customProjects` viaja al cálculo del
  disponible (alias legacy tipo PLANTEL mezclaban proyectos); la duración es
  la misma en pantalla, form y PDF (9-sep→14-oct = 35 días); las raíces de
  sección de GeoCost llevan `gridTemplateColumns: minmax(0,1fr)` (la tabla de
  Movimientos estiraba TODA la vista a 1124px en el teléfono); `cc-file-` se
  agregó a SKIP_LOCAL_PREFIXES y EVICTION_PRIORITY_PREFIXES de supabase.js.
  **ÍTEMS DEL PRESUPUESTO en las solicitudes (25-sep-2026, pedido de
  Gerson)** — "solo se debería comprar lo que está en la receta del pastel
  que me pasa el PM". Caso real: MAT-2026-0422 (Torre Adobe) traía tubo PVC
  4" + poliducto negro, que en el presupuesto son partidas DISTINTAS, y una
  solicitud solo podía ir a UNA partida. Ahora una solicitud lleva
  `lineas: [{id, partidaId, categoria, nombre, unidad, cantidad, monto}]`
  (campo ADITIVO en cp-purchases; nombre/unidad van COPIADOS del presupuesto
  al guardar). `monto` es el de la cotización; el TOTAL que manda sigue
  siendo `amount` (lo que paga Tesorería): `repartirLineas` (geocost-calc)
  le da a cada partida la PROPORCIÓN de su ítem — así el ISV, el flete o un
  descuento se reparten solos, y el último ítem se lleva el redondeo para
  cuadrar al centavo. `movimientosCompras` emite UN movimiento por ítem (id
  `<compraId>::<lineaId>`, `dividida: true`); sin `lineas` válidas la compra
  sigue como antes con su `partidaId` único (compatibilidad total).
  `partidaId` se sigue llenando con la partida de MÁS plata (para lo que aún
  lee una sola). Componente compartido **`src/lineas-presupuesto.jsx`**:
  `LineasPresupuesto` (pills de categoría con las que tiene el presupuesto →
  "+ Agregar ítem de X" → select SOLO con los ítems de esa categoría,
  cantidad con la unidad del PM, monto L; disponible por ítem y aviso si lo
  pasa; suma de ítems y aviso si difiere del total), `evaluarLineas`,
  `errorLineas`, `lineasParaGuardar`, `descripcionDeLineas`,
  `lineasIniciales` y `DividirItemsModal`. Se usa en: (1) **form de
  solicitud** de GeoShopping cuando el proyecto tiene presupuesto con ítems
  comprables (si no, el form es IDÉNTICO a antes, texto libre) — el textarea
  pasa a "Detalle adicional (opcional)" (`detalleExtra`) y `description` se
  ARMA con los ítems ("5 Lance × Tubo PVC…", un renglón por ítem) + ese
  detalle; al editar una VIEJA de texto libre, su descripción original cae
  en el detalle para no perderse; (2) **Corregir compra pagada** (Gerson/
  Christian) — reparte en ítems SIN tocar la descripción ni el pago;
  (3) **GeoCost → Movimientos**: enlace "Dividir en ítems" / "Editar ítems"
  bajo la partida de cada compra de GeoShopping (`guardarItems`: getCloud →
  map por id → set → verify, audit `partida_reclasificada`, que `sP` de
  GeoShopping RESCATA junto con `lineas`). Las filas ya divididas muestran
  el nombre de la partida (no el select de reclasificar). Los ítems de
  Personal (módulo `mo`) no se ofrecen: la MO sale de GeoTeam. Sobregiro:
  por partida, sumado; UNA justificación por solicitud. ⚠ **GeoMachinery NO
  tiene ítems todavía** (sigue con una partida; "Dividir" solo aparece en
  compras de GeoShopping porque el `sP` de GeoMachinery no rescata `lineas`).
  **SUSTITUTOS — "Es otro material" (30-sep-2026, caso Villa San Miguel)**: el
  presupuesto se hizo para colar pilotes con concreto premezclado
  subcontratado, pero por operación se cambió a fabricarlo con el Fiori
  propio (cemento, arena, grava). Diseño pidió que eso siga bajando de la
  partida "Concreto premezclado…", pero la descripción le decía a la Lic.
  Carolina "concreto premezclado" cuando se compraba arena. Cada ítem de
  `LineasPresupuesto` trae el enlace **"Es otro material"** → caja ámbar con
  "Qué se compra realmente" + Unidad + Motivo (opcional); la unidad junto a
  la cantidad pasa a ser la del material real. Se guarda en la línea como
  `sustituto: {nombre, unidad, motivo}` (ADITIVO); `nombre`/`unidad` de la
  línea siguen siendo los de la PARTIDA (GeoCost los usa). `descripcionDeLineas`
  escribe lo REAL ("32 m3 × Arena de río"); helpers `nombreRealDe` /
  `unidadRealDe`. `errorLineas` exige el nombre real si se marcó. En el
  detalle de la solicitud: nombre real + chip ámbar "Sustituto" + "se carga
  a: <partida> — <motivo>"; en GeoCost el movimiento lleva `sustituto: true`
  (chip "Sustituto" en Movimientos) y el detalle "sustituto de: <partida>".
  El detalle muestra la descripción con `pre-line` (antes salía todo pegado
  en un renglón). `sP` rescata también `description`/`detalleExtra` cuando la
  entrada de audit `partida_reclasificada` trae `ajustaDescripcion: true`.
  La MAT de ICMOVA (Villa San Miguel, L 57,120) se corrigió en la nube el
  30-sep: Gravín 3/8 (L 27,520, con ISV) y Arena de río (L 29,600, exento),
  32 m3 cada uno, como sustitutos del concreto premezclado. A futuro Gerson
  quiere "materiales permitidos" por partida en el presupuesto (aún NO).
  **P.U. REAL por ítem (26-oct-2026)**: `precioUnitarioReal(movs)` en
  `resumenPresupuesto` = (comprometido + ejecutado) ÷ cantidad comprada, solo
  de las líneas con cantidad en la unidad de la partida (`cantidadPartida`;
  sustitutos y líneas manuales no cuentan). En Proyectos sale "Real $ X /
  unidad (±N %)": verde igual o abajo del P.U. del PM, rojo si va +3 % arriba.
  Partida alimentada con SUSTITUTOS (se fabrica: concreto del Fiori en Villa
  San Miguel) → no se calcula de las compras (`fabricada`); el costo sale de
  la ficha de costo: "Poner costo real" (admin/costos/compras_ops) guarda
  `puRealManual` (USD) + `puRealFuente` en la partida (`guardarCostoReal`,
  solo toca esa partida sobre la nube fresca) y manda sobre el cálculo. VSM
  concreto = $161.90/m³ (ficha Fiori oct-2026). El 26-oct se corrigieron en
  la nube MAT-2026-0513/0579/0581 (decían 480/1/200 m³ de concreto; eran
  480/480/200 bolsas de cemento) → sustitutos, misma partida.
  **Dashboard v4 (25-sep-2026)**: la columna del medio (una tarjeta con
  anillo POR proyecto, apiladas) no escalaba — "ahorita son 2 pero serán
  más" — y con nombres largos el título se encimaba con el anillo. La
  reemplaza `ruedaProyectos()`: UNA dona "Gastado por proyecto" (cada tajada
  = EJECUTADO de un proyecto, `PALETA` carbón/naranja/grises, total al
  centro) + la lista de proyectos debajo (scrollea dentro de la tarjeta) con
  su monto, su % del total y "N % de su presupuesto"; click abre el proyecto.
  **Unidades (25-sep-2026)**: el form de presupuesto traía "Global"
  pre-llenado en cada partida nueva y las 51 de Torre Adobe quedaron en
  "Global" aunque el PM las manda en Lance, Cubeta, Rollo, m… — ahora la
  unidad nace VACÍA y `UNIDADES` (sugerencias del datalist, texto libre)
  suma las del PM. Datos de Torre Adobe corregidos directo en la nube el
  25-sep con las unidades del presupuesto de ingeniería (37 de 51; las 14
  que no se veían en las capturas quedaron en blanco para llenarlas a mano)
  y su partida de mano de obra pasó de módulo `compras` a `mo` (la MO de
  GeoTeam caía en "Por clasificar"). En Proyectos la partida se lee "95
  Lance · P.U. $ 5.03".
  **VARIAS SOLUCIONES en un presupuesto (25-sep-2026, caso Aurea Edificio
  Corporativo 2da Etapa, HR-20-3-22)**: el PM manda algunos presupuestos
  divididos por SOLUCIÓN (1. Muro anclado · 2. Pantalla de pilotes · 3.
  Anclajes activos · 4. Otros), cada una con sus categorías, y el MISMO ítem
  se repite en varias con su propio monto. Campo ADITIVO `partida.solucion`
  (texto; vacío = presupuesto de una sola solución, que se ve y funciona
  igual que antes). Helpers `solucionesDe(pres)` / `tieneSoluciones(pres)`.
  PresupuestoForm: check "El proyecto tiene varias soluciones" → columna
  Solución (datalist con las ya usadas; "+ Partida" copia la de la fila
  anterior) y subtotal por solución; con el check, toda partida DEBE tener
  solución. Partidas en **$0 con nombre SÍ se aceptan** (antes el form las
  rechazaba): así vienen los "Materiales (CLIENTE)" del PM — nota "Material
  del cliente". `resumenPresupuesto` devuelve `soluciones: [{solucion,
  ...pct, categorias}]` y el detalle de GeoCost agrupa solución → categoría
  → partida con pills "Todas las soluciones / Muro anclado · 12 %…"
  (`solFiltro`). `opcionesPartidas` rotula los grupos "Solución ·
  Categoría". **MO con varias partidas `mo`** (una por solución): la MO de
  GeoTeam es por PROYECTO, así que se reparte PROPORCIONAL a lo que cada una
  presupuestó (el detalle del movimiento dice "Muro anclado: 69 %").
  En la solicitud (`LineasPresupuesto`) primero se elige la SOLUCIÓN (pills
  carbón), después la categoría y el ítem; la línea guarda `solucion`.
  Aurea 2da Etapa se cargó el 25-sep directo en la nube, TAL CUAL el PM: 88
  partidas, $238,382.87 (71,905.38 + 111,746.03 + 40,221.95 + 14,509.51 —
  cuadrado al centavo), incluye los materiales del cliente en $0 y la
  "Recarga acetileno" repetida de Anclajes activos ($30.28, así viene; por el
  precio parece oxígeno). Varilla #11 G60: cantidad 30.612657 Ton para que ×
  1,050 dé exacto $32,143.29. El PM usa tasa 26.89; GeoCost la global 27.
  Torre Adobe (mismo día): las 14 unidades que faltaban completadas y los 5
  materiales importados pasados de "Otros" a Materiales.
  **Acceso de Arturo/Christian a presupuestos (16-sep-2026, pedido de
  Gerson)**: `puedeEditarPresupuesto` pasó de `isAdmin` a
  `isAdmin || isCostos || isComprasOps` — Arturo (rol `compras_ops`, antes
  SIN acceso al módulo) entra ahora a GeoCost solo para cargar/editar
  presupuestos de proyecto; Christian (rol `costos`) ya entraba pero antes
  no podía tocar presupuestos, solo reclasificar. Tasa de cambio
  (`puedeTasa`), crear/recibir/acreditar movilizaciones y reclasificar
  partidas **NO cambiaron** — siguen exactamente como estaban (admin para
  tasa y movilizaciones; admin/costos/tesoreria para reclasificar).
- `TasksModule.jsx` (**Mis Tareas, 18-sep-2026**) — pedido de Gerson: "que si le
  das click [a TO-DOS] entrés a otra página donde estén todos tus to-dos; una
  herramienta para que TODOS los colaboradores organicemos nuestras tareas CON
  FECHA, para planificarnos mejor". Módulo propio en MODULES (id `tareas`,
  abierto a todos los roles menos la tablet `marcaje`) + atajo desde el título
  de la tarjeta TO-DOS de la bienvenida (`onAbrirTareas` → cierra la bienvenida
  y entra al módulo). MISMA key que la tarjeta: **`gt-todos-<username>`** — a
  propósito, los pendientes viejos aparecen sin migrar nada y lo que se agrega
  en un lado se ve en el otro. Campos nuevos ADITIVOS: `fecha` (YYYY-MM-DD),
  `doneAt`; una tarea vieja sin fecha cae en "Sin fecha". Vistas: Todas · Hoy ·
  Esta semana (lunes→domingo) · Hechas, agrupadas por día. Una tarea con fecha
  pasada se pinta de ROJO clarito con "Atrasada N días" (misma semántica y
  colores que "Vencida" de GeoShopping). El guardado usa el patrón robusto
  (getCloud + rescate de lo que agregó el otro dispositivo + verify), no el
  best-effort de la tarjeta. Las fechas se comparan como STRING YYYY-MM-DD con
  partes locales — `new Date("2026-09-18")` es medianoche UTC y en Honduras
  devolvía el día anterior.
- `GeoSupplyModule.jsx` (**GeoSupply — Solicitudes de material, 2-oct-2026**)
  + `geosupply-calc.js` (lógica PURA, testeada: `npm test` →
  `tests/geosupply-calc.test.mjs`, node:test). Del residente a la aprobación:
  residente pide ítems de la receta (cc-presupuestos) → Almacén (Óscar,
  `logistica`) revisa stock → Compras (Ana) cotiza → Coordinador (Gerson)
  aprueba → la cotización aprobada cae como BORRADOR en GeoShopping y Finanzas
  solo completa condición de pago / fecha / "Va a" / cierre contable.
  Reemplaza la solicitud que hoy se hace en GeoControl (no se integra).
  **Decisiones aprobadas en la Fase 0 (no re-litigar)**: (1) el borrador en
  cp-purchases mantiene `status:"borrador"` + marca `origenSupply {requestId,
  quoteId, folios, aprobadoPor, aprobadoAt, tasaCambioUsada, avisos}` — todo lo
  que hoy excluye borradores lo sigue excluyendo; GeoCost lo contará como
  comprometido por la marca (Fase 4); (2) el corte se nombra **"Corte 40 ·
  2026"** (semana ISO) con "lun 28 sep – vie 2 oct" debajo, id `C40-2026`;
  (3) rol nuevo `residente`: SOLO GeoSupply + Mis Tareas, nunca GeoShopping;
  los residentes se crean desde **GeoTeam → Accesos**; (4) empresa del
  borrador = la del proyecto base, si no "geotecnica" (Finanzas confirma);
  (5) las automatizaciones por hora NO escriben nada: `estadoEfectivoLinea`
  trata una línea en revisión de almacén como "por cotizar · sin revisión"
  pasado el martes 15:00 (no hay servidor), y el estado se escribe cuando
  Compras actúa; (6) urgentes existen, se saltan el corte, pero cada una la
  aprueba Gerson y se mide en rojo; (7) Finanzas (costos/compras_ops/
  tesoreria) y gerencia entran SOLO LECTURA.
  **Keys**: `sp-solicitudes` (una por solicitud con sus `lineas[]` adentro:
  `{id, folio SUP-AAAA-NNNN, projectCode, residente (username),
  fechaRequeridaObra, corte{anio,semana}, urgente, justificacionUrgencia,
  estado, lineas[{id, partidaId, materialCode?, descripcion, unidad,
  cantidad, fueraPresupuesto, justificacion, excedeSaldo, estado,
  despachadoAlmacen, aCotizar, cantidadComprada, quoteIds[], motivoRechazo}],
  audit[]}`), `sp-cotizaciones` (`{id, folio CTZ-AAAA-NNNN, requestId,
  projectCode, providerId, provider, numeroProveedor, pdfFile, totalDeclarado,
  incluyeISV, condicionPago, lineas[{requestLineId, cantidad, parcial, puLps,
  justificacion}], estado, aprobadoPor, aprobadoAt, comentario,
  tasaCambioUsada, purchaseId, audit[]}`), `sp-config` (CONFIG_DEFAULT:
  cortes martes 12:00 / martes 15:00 / viernes 12:00, llegada mar–jue,
  semáforo 3 %/10 %, tolerancia L 1, `cierrePorProyecto`), `sp-file-<id>`
  (PDFs; en SKIP_LOCAL_PREFIXES). Bitácora = `audit[]` dentro de cada entidad
  (mismo patrón de cp-purchases), no una key aparte.
  **Estados** (geosupply-calc): solicitud borrador → enviada → en_proceso →
  completada / cancelada (`estadoCabecera` derivado de las líneas;
  `puedeCancelar` solo antes de que almacén toque algo). Línea: nace en
  `pendiente_coord` (fuera de presupuesto / excede saldo / urgente) o en
  `revision_almacen`; → `despachada_almacen` | parcial (despachado + resto a
  `por_cotizar`) | `por_cotizar` → `cotizada` → `comprada` (al aprobar la
  cotización; `cantidadComprada` acumula, así una cotización PARCIAL deja el
  resto pendiente) | `rechazada` (motivo obligatorio). `aplicarAccionLinea`
  valida cada transición. Cotización: borrador → enviada → aprobada /
  devuelta / rechazada. `saldoDePartida` = cantidad presupuestada − ítems de
  cp-purchases que consumen (validado/pagado/finalizado o borrador con
  origenSupply) − líneas activas no rechazadas (cantidad − cantidadComprada).
  `evaluarCotizacion`: P.U. con ISV en L → USD a la tasa; variación contra
  `pu` de la partida (el presupuesto ya trae ISV); semáforo; suma vs total con
  tolerancia y el mensaje "multiplicá cada P.U. por 1.15"; parcial exige la
  marca; rojo exige justificación. `borradorDesdeCotizacion` arma el registro
  con el MISMO shape del form de GeoShopping (`lineas` con partidaId para que
  nunca caiga en Por clasificar, `description` un renglón por ítem, datos
  bancarios de cp-providers o aviso "Proveedor sin datos bancarios en el
  maestro", fecha de pago = obra − 2 días, `destinoSugerido`: crédito → cxp,
  urgente o requerida el lun/mar próximo → prioridad, si no normal).
  **Hora Honduras**: `partesHN` (Intl + TZ_HN) para el cierre del martes;
  en el minuto exacto del hito ya se considera pasado.
  **Las 5 fases quedaron hechas el 2-oct-2026** (Gerson: "hacé todas las fases
  de una"). Pantallas por rol (`rolSupply`): **Coordinador** (admin) = Hoy ·
  Alertas · Cotizaciones · Solicitudes · Almacén · Compras · Dashboard ·
  Configuración; **Residente** = Mis solicitudes (+ Nueva solicitud, detalle
  con tracking tipo "dónde va mi pedido": `PasosLinea` Enviada → Almacén →
  **En cotización** → Aprobación → **Pendiente de pago** (pasa a "Pagado" en
  verde cuando la Lic. Carolina paga) → **En camino a tu proyecto** (pasa a
  "Entregado en tu proyecto" en verde con la FICHA FIRMADA — `entregaDe(pu)`:
  `delivery.fichaFile` o deliveryStatus `ficha_adjunta`, o `cerrado` sin
  ficha; el candado de GeoLogistics exige la ficha para marcar entregado) —
  nombres del 13-oct-2026, pedido de Gerson; el chip de la línea comprada
  dice lo mismo (Pendiente de pago / Pagado · en camino / Entregado en tu
  proyecto). "En camino / Terminadas": una completada sigue "en camino"
  hasta que tenga la ficha. En la simulación, "GeoShopping simulado" suma el
  botón "Logística: entregado con ficha" para ver el proceso hasta el final);
  **Almacén** (Óscar, `logistica`) = Almacén (Hay / Parcial / No hay por
  línea, "No hay nada de esto" por proyecto, cuenta regresiva al martes 15:00
  del corte más próximo) · Solicitudes; **Compras** (Ana) = Por cotizar
  (agrupado por proyecto, botón "Cotizar (N)" → `CotizacionFormImpl`:
  proveedor del maestro o nuevo, N° cotización, Contado/Crédito, checkbox por
  línea, cantidad con "parcial" automático, P.U. con ISV, semáforo en vivo,
  justificación si rojo, total, PDF a `cp-file-<id>`; devueltas con el
  comentario) · Cotizaciones · Solicitudes; **Finanzas/Gerencia** = Hoy ·
  Solicitudes · Cotizaciones · Dashboard, solo lectura. Forms a NIVEL DE
  MÓDULO: `SolicitudFormImpl` (buscador de la receta con saldo en vivo,
  "Excede el saldo" en vivo, "+ Agregar ítem fuera de presupuesto" con
  justificación, urgente con justificación, corte y llegada estimada al pie)
  y `CotizacionFormImpl`. Aprobación (`renderAprobar`, modal xl): TRES
  columnas lo pedido · lo cotizado · presupuesto (P.U.) con semáforo por
  línea, Ver PDF, comentario, **Aprobar / Devolver a Compras / Rechazar**;
  "Aprobar las N en verde" (masivo, solo `evaluacion.todasVerdes`).
  **Guardado**: `actualizarEn(key, setter, id, fn)` aplica `fn` al registro
  FRESCO de la nube (getCloud → fn → set → verify por `updatedAt`); nunca se
  escribe la foto local. `accionLinea`/`accionLineas` (una escritura por
  solicitud) usan `aplicarAccionLinea` del calc. `aprobarCotizacion` (la
  integración): lee TODO fresco (cotizaciones, solicitudes, cp-purchases,
  cp-providers, cc-config), re-evalúa, enriquece las líneas con la partida,
  (1) crea el BORRADOR en cp-purchases con `borradorDesdeCotizacion` + código
  `siguienteCodigoCompra` (IDEMPOTENTE: si ya existe uno con
  `origenSupply.quoteId` no se duplica; proveedor nuevo → cp-providers con
  `autoImported`), (2) `aprobar_cot` en las líneas (cantidadComprada → estado
  comprada / sigue por cotizar si fue parcial), (3) cotización `aprobada` con
  `tasaCambioUsada`, `purchaseId/purchaseCodigo`, `evaluacion` (snapshot del
  semáforo para el dashboard) y `avisos`. Devolver/Rechazar → `devolver_cot`
  en las líneas (vuelven a por cotizar). `materializarSinRevision`: si Compras
  cotiza una línea que almacén nunca revisó (venció el martes 15:00), primero
  se escribe `almacen_no_hay {sinRevision}` en la nube.
  **GeoShopping (PurchasesModule)**: `esBorradorSupply(p)` (a nivel de módulo);
  esos borradores SOLO se ven en la vista **"Borradores (n)"** de Solicitudes
  (`filter.ver === "borradores"`, botón junto a Pendientes/Pagadas/Ambas, no en
  GeoMachinery) y se EXCLUYEN de pendientes/ambas, de `nPend` y de las
  candidatas de Prioridades; chip naranja "GeoSupply" en la tabla; bloque
  "Viene de GeoSupply" en DetailView. `renderBorradoresSupply`: tira (n ·
  monto aprobado aún no en Tesorería · sin datos bancarios), grupos por
  PROYECTO → CORTE, fila con chips (Contado/Crédito · Va a · fecha de pago ·
  Cierra · Urgente · avisos), checkbox + "Seleccionar todos" + **"Enviar N a
  Tesorería"** (masivo) y botón por fila; click → `BorradorSupplyFormImpl`
  (lo que viene de la cotización en solo lectura + los 4 campos de Finanzas:
  condición de pago, fecha, Va a, cierre contable; Guardar / **Enviar a
  Tesorería**). `enviarBorradoresATesoreria` = el MISMO `validado` +
  `treasuryStatus pendiente` + `validatedAt` + audit `approved` + `encolarPago`
  del flujo normal, en UNA escritura de `sP`. `canCreate` (admin/costos/
  compras_ops) envía; Carolina solo mira. `visorGlobal` para el PDF.
  **GeoCost**: `estadoCompraCosto` cuenta `borrador + origenSupply` como
  comprometido; al validarse sigue comprometido y al pagarse ejecutado — mismo
  registro, sin doble conteo (verificado 2-oct: $1,057.41 comprometido → tras
  pagar una, 759.26 + 298.15 = 1,057.41). Ítems con partida → nunca "Por
  clasificar".
  **Dashboard** (`renderDashboard` + `metricasDashboard` del calc): pills de
  corte (todos / actual / anteriores) + select de proyecto; tira (solicitudes
  · % enviadas dentro del corte · % urgentes · envío→aprobación · cotizaciones
  aprobadas · ítems fuera de corte); tarjetas Por estado · Semáforo de precio
  (barra verde/amarillo/rojo de los ítems aprobados + variación promedio por
  proyecto) · Por proyecto (barras) · Tiempo promedio por etapa (residente→
  almacén→cotización→aprobación→Tesorería→pago→entrega, con lg-despachos) ·
  Por residente (en corte %, urgentes %, rechazados) · Ítems fuera de corte.
  `enviadaEnCorte` = enviada ANTES del cierre de su corte (una urgente del
  miércoles cuenta como fuera). **Panel**: `PanelCard` recibe `badge`
  (circulito naranja) y App calcula `contarPendientes` por rol con getCloud al
  mostrar el panel (`badges.geosupply`).
  **Prueba de punta a punta (2-oct-2026, proyecto ZZ-PRUEBA-SUPPLY, borrado
  después)**: residente pidió 3 ítems de la receta + 1 fuera (uno excedía el
  saldo) → Coordinador aprobó la alerta y rechazó el fuera de presupuesto con
  motivo (el residente lo vio) → Almacén despachó 4 de 10 tubos y "No hay" al
  resto → Compras armó 2 cotizaciones de proveedores distintos (una con línea
  en rojo justificada; la otra no cuadró el total y quedó bloqueada con el
  mensaje del 1.15 hasta corregirla) → Coordinador aprobó una y devolvió la
  otra; Compras corrigió y se aprobó con "Aprobar las N en verde" → en
  GeoShopping aparecieron 2 borradores en "Borradores (2)" con proveedor,
  monto, ítems con partida y datos bancarios (la del proveedor nuevo con el
  aviso); Pendientes de pago NO los contó → GeoCost comprometido subió
  exactamente $1,057.41 y nada en Por clasificar → Finanzas envió los 2 en
  lote (uno cayó a Cuentas por pagar por ser crédito) → al pagarse uno pasó a
  ejecutado sin doble conteo → bitácora con usuario y fecha en cada paso.
  Pruebas Node: 15 (`npm test`).
  **Cambios del 12-oct-2026 (Gerson, al volver de viaje)**: (a) **el residente
  ya NO tiene proyectos asignados**: elige el proyecto en cada solicitud
  ("se rotan, cambian de proyecto rápido o se cubren"); `misProyectos` = TODOS,
  agrupados "Con receta en GeoCost" / "Sin receta". GeoTeam → Accesos ya no
  pide proyectos (el campo `proyectos` de gt-usuarios queda ignorado). Esto
  reemplaza la regla del spec "residente sin el proyecto asignado = acceso
  denegado" — decisión de Gerson, no re-litigar. (b) **SIMULACIÓN** (⚠ APAGADA el 27-oct-2026 al arrancar el uso real: `puedeSimular = false`; el código y las keys sp-sim-* quedan) (solo el
  Coordinador, botón "Simular el proceso" en Hoy): barra ámbar con "Ver como
  Residente · Almacén · Compras · Coordinador · Finanzas" (`simRol`, cambia el
  `rol` efectivo y salta a la primera pestaña de ese rol), keys PROPIAS
  `sp-sim-solicitudes` / `sp-sim-cotizaciones` / `sp-sim-purchases` (`K` +
  `kRef` para `cargar`), recetas y proveedores reales en solo lectura, el
  borrador sale con código `SIM-AAAA-NNNN` y `simulacion:true` a
  sp-sim-purchases (NUNCA a cp-purchases; el proveedor nuevo NO se crea en
  cp-providers). "GeoShopping simulado (n)" muestra los borradores como los
  vería Finanzas + el impacto en GeoCost por partida (`movimientosCompras`
  sobre los simulados) y deja "Finanzas: enviar a Tesorería" → "Tesorería:
  marcar pagada" para ver comprometido → ejecutado. "Reiniciar" borra las 3
  keys y los PDFs simulados (`store.remove`). **Borrar UNA solicitud simulada
  (13-oct-2026, pedido de Gerson)**: botón "Borrar" en cada fila de
  Solicitudes y "Borrar de la simulación" en el detalle, SOLO con `sim`
  prendido (`borrarSolicitudSim` aborta si `K` no apunta a las sp-sim-*). Se
  lleva sus cotizaciones simuladas (las que cubren SOLO ítems de ella; a una
  que también cubre otra solicitud solo se le quitan sus ítems), los
  borradores de sp-sim-purchases que salieron de esas cotizaciones y sus PDF;
  cada key con getCloud → quitar → set → verify. En simulación el saldo usa
  `purchasesVista` = reales + simulados. `gt-supply-sim` en sessionStorage.
  **Óscar PIDE para el plantel y el taller (26-oct-2026)**: el rol almacén
  también ve "+ Nueva solicitud" en Solicitudes (proyecto PLANTEL ya
  elegido). Sus solicitudes llevan `sinAlmacen: true`: no pasan por la
  revisión de almacén (sin alerta → `por_cotizar` directo; con alerta, al
  aprobarla el Coordinador → `por_cotizar`; desde el 26-oct en la noche lo
  "Sin receta" de Óscar va DIRECTO a Compras y el Coordinador aprueba en la
  cotización — solo urgente o fuera-de-receta pasan antes). **COTIZACIÓN
  ADJUNTA** (pedido de Óscar): en "Comprar material" cualquiera puede
  adjuntar la(s) cotización(es) que ya consiguió (`sol.cotizacionesAdjuntas`
  [refs cp-file-*]); en Compras sale "Trae cotización" y el form de Ana
  muestra "Ya viene con cotización" con Ver / "Usar y leer" (la pone como
  `pdfFile` y corre el lector). **Proyecto SIN receta** (el
  plantel): los ítems se piden libres, SIN justificación obligatoria
  (`linea.sinReceta`, alerta "Sin receta"), todos pasan por el Coordinador
  (aprueba o rechaza) y siguen el proceso normal de compra.
  **Numeración de cortes (26-oct-2026, Gerson)**: el primer corte REAL (cierre
  mar 27-oct-2026 12:00, semana ISO 44) es el **"Corte 1"** y siguen seguidos
  sin reiniciar por año (`LUNES_PRIMER_CORTE`, `numeroCorte`); lo anterior
  conserva "Corte NN · AAAA". El `id` (C44-2026) no cambió. (Reemplaza el
  nombre "Corte 40 · 2026" de la Fase 0.)
  **REVISIÓN DE SINCRONIZACIÓN antes del arranque real (26-oct-2026, noche)**:
  revisión adversarial + corrida real de punta a punta (datos ZZ borrados).
  Corregido: (1) CRÍTICO — una cotización que cubre ítems de VARIAS
  solicitudes solo actualizaba la primera (`cot.requestId`) y las demás
  quedaban trabadas en "cotizada" para siempre; `aprobarCotizacion` ahora
  agrupa por `linea.requestId` y actualiza cada solicitud; `renderAprobar`/
  `renderDetalle` buscan las líneas en todas. (2) `aprobarCotizacion` relee
  cp-purchases / sp-solicitudes / sp-cotizaciones JUSTO antes de cada
  escritura (antes usaba fotos de varios segundos y podía pisar un pago de
  Tesorería o una solicitud recién enviada) y VALIDA antes de crear el MAT
  que cada línea esté "cotizada" en esa cotización (si no, aborta: evita la
  compra doble). (3) `escribirLista` hace una SEGUNDA lectura ~1.2 s después
  del verify: si otro guardado simultáneo pisó el mío devuelve "perdida" y
  `crearEn`/`actualizarEn` rehacen la operación sobre la nube fresca (hasta
  2 reintentos; el folio se recalcula); si el verify no responde avisa "se
  guardó pero no pude confirmarlo" en vez de "no se guardó". (4) Guardia
  anti-pisada `lastLocalMutAtRef` (8 s) en `cargar`, y el latido/foco es
  LIVIANO (solo sp-solicitudes/sp-cotizaciones; todo lo demás cada 5
  latidos). (5) `guardarCotizacion`: si al enviar no se pudieron marcar las
  líneas, la cotización vuelve a borrador; `accionLineas` avisa cuando
  ninguna línea estaba en el estado esperado. (6) Login: si la nube no
  responde dice "No hay conexión" (antes "clave incorrecta"). (7) El
  contador de Almacén suma los pedidos al plantel. (8) sp-solicitudes y
  sp-cotizaciones en SKIP_LOCAL_PREFIXES. Pendiente (BAJO): archivos
  cp-file-* huérfanos al cancelar un form con cotización adjunta; archivar
  solicitudes viejas cuando sp-solicitudes pase ~1 MB.
  **RECETA DESPLEGADA al pedir (27-oct-2026, pedido de los ingenieros: "que
  salga la receta completa, así no se nos olvida nada")**: en
  `SolicitudFormImpl` ya no hay que buscar: TODA la receta sale agrupada por
  categoría (y solución si tiene varias), con lo que queda de cada ítem; un
  toque lo agrega (check verde + "En tu pedido · N"). El buscador solo
  filtra. La lista scrollea dentro de su caja (420 px).
  **Proyecto SIN receta → catálogo (27-oct-2026)**: `catalogo` (useMemo en
  el módulo) = los ítems pedibles de TODAS las recetas activas sin repetir
  (nombre + unidad) con en qué proyectos aparecen; en el form sale "Materiales
  de otras recetas" agrupado por categoría, un toque lo agrega como ítem libre
  (`deCatalogo: true`, nombre y unidad puestos) y sigue el camino de siempre
  (lo aprueba el Coordinador).
  **Almacén agrupado POR SOLICITUD (27-oct-2026, Óscar: "no me deja ver qué
  pidió cada uno, solo así por encima")**: dentro de cada proyecto, una cajita
  por solicitud (`porSolicitud`): folio, quién la pidió, fecha requerida,
  corte, N ítems, sus NOTAS y "Ver solicitud"; los ítems van debajo sin
  repetir folio/quién (`filaLinea({enSolicitud})` muestra solución ·
  categoría). Aplica a la revisión de compras, a los pedidos al plantel, a
  Compras y a Alertas. **Almacén fuera de plazo (27-oct, Gerson)**: lo que se
  pasó del martes 15:00 sin revisión sigue en la pestaña Almacén (chip "Sin
  revisión de almacén") y en Compras trae "¿Hay en almacén?" Hay / Parcial /
  No hay (`botonesAlmacen`, Óscar y el Coordinador) mientras la línea guardada
  siga en `revision_almacen` (nadie la cotizó todavía).
  **Un solo proyecto para el plantel (28-oct-2026, Gerson)**: PLANTEL
  ("Instalaciones Plantel") y PLANTEL-OFICINA ya NO reciben solicitudes:
  `PROYECTOS_SIN_SOLICITUDES` / `admiteSolicitudes` en projects.js los saca del
  selector de GeoSupply y del form de GeoShopping/GeoMachinery (salvo que la
  solicitud que se edita ya los tenga); todo se pide a **PLAN-TALLER** (el
  default de Óscar). Las compras viejas quedan como estaban. SUP-2026-0009 se
  movió a PLAN-TALLER en la nube. **"Aprobar y mandar a Finanzas"** en el form
  de cotización, solo el Coordinador: envía y aprueba de una
  (`guardarCotizacion` ahora devuelve la cotización → `aprobarCotizacion`) —
  para las que ya traen cotización.
  **Corte 1 + perdonar (28-oct-2026, Gerson)**: el Coordinador puede pasar
  una solicitud a otro corte desde su detalle ("Pasar al Corte N",
  `cambiarCorte`) → `corteAjustado {de, por, at, motivo}` + audit
  `corte_ajustado`; chip ámbar "Enviada tarde · ajustada" y en el Dashboard
  "Por residente" cuenta "N perdonadas" (y `enviadaEnCorte` las marca fuera de
  hora). SUP-0008/0009/0010/0012 se pasaron del Corte 2 al Corte 1 en la nube
  (todo el primer corte = Corte 1). Solicitudes ganó el filtro por corte
  (`solCorte`) y va ANTES de Cotizaciones en el menú del Coordinador.
  **Cumplimiento por residente (28-oct-2026, Gerson: "que diga qué es cada
  una")**: la tarjeta del Dashboard es una tabla a todo lo ancho con columnas
  rotuladas (Enviadas · A tiempo "4 de 7" + % · Fuera de hora + perdonadas ·
  Urgentes · Rechazados) y una leyenda de una línea abajo.
  **Dashboard más compacto (28-oct-2026, Gerson)**: quedan filtro de corte,
  tira global, **Por proyecto** (barras VERTICALES: a tiempo carbón · fuera de
  hora naranja · al plantel gris; tocar una barra filtra el proyecto), Tiempo
  promedio por etapa y Cumplimiento por residente. Se retiraron "Por estado"
  (se mudó a **Hoy** como "Dónde están las solicitudes", con pills por corte,
  `renderEstadoCorte` / `hoyCorte`), "Semáforo de precio" e "Ítems fuera de
  corte" (el número sigue en la tira).
  **Borrador para Finanzas: fecha en obra (28-oct-2026, Gerson: "¿cómo va a
  ver Christian qué día se necesita en proyecto?")**: `origenSupply` lleva
  ahora `fechaRequeridaObra` y `justificacionUrgencia`; el form del borrador
  muestra "Se necesita en obra el …" + "Urgente · aprobada por …" + el por qué,
  y debajo de la fecha de pago "viene puesta 2 días antes"; la fila trae el
  chip azul "En obra …". MAT-2026-0601 se completó en la nube. Fix de paso:
  `fmt` de PurchasesModule formatea las fechas PURAS en UTC (el chip decía
  "Pago 31 oct" para el 1 nov).
  **GEOLITO EL TÉCNICO (28-oct-2026)**: `src/geolito.jsx`, solo en GeoSupply,
  circulito abajo a la derecha que abre un chat de preguntas frecuentes SIN IA
  ni servicio externo (respuestas escritas, con días/horas de la
  Configuración). Preguntas: "¿Cómo funciona el proceso?" y "¿Qué pasa si
  envío una solicitud fuera de tiempo y la necesito?". Imagen
  `public/brand/geolito.png` (si falta, sale un dibujo SVG de respaldo).
  **PEDIR AL PLANTEL / TALLER (26-oct-2026)**: caso Ing. Yurien (Cataleya):
  placas de anclaje y varillas roscadas que se producen en soldadura/torno y
  Almacén va enviando según se necesita — NO es compra. Al crear la solicitud
  se elige "Comprar material" | "Pedir al plantel / taller" (`sol.tipo`
  "compra" | "plantel"; `esPedidoPlantel`). Plantel: ítems libres
  (`linea.plantel`), sin receta, sin corte ni urgente, sin alertas → nacen en
  `plantel_pendiente` y le llegan DIRECTO a Óscar (decisión de Gerson: sin
  aprobación) en el bloque "Pedidos al plantel / taller" de la pestaña
  Almacén: Enviar todo · Una parte (`plantel_enviar`, acumula
  `enviadoPlantel` + `enviosPlantel[]`, completo → `plantel_enviado`) · No hay
  (`plantel_no_hay`: rechazada con nota, `noHayPlantel`; el ingeniero decide
  si lo pide como compra). El ingeniero ve barra "Enviado X de Y" con cada
  envío. Fuera de Dashboard, "fuera de corte" y "faltan para el viernes".
  La SUP-2026-0001 de la Ing. Yurien (5 ítems mal pedidos como compra) se
  borró el 26-oct a pedido de Gerson (respaldo en el scratchpad de la sesión).
  **VARILLA POR PESO (12-oct-2026, caso acero de Villa San Miguel)**: el PM
  manda el acero como UNA partida en **Ton** ("Acero de construcción, varios
  diámetros", 46.22 Ton a $1,050) pero se compra en LANCES. Decisión de
  Gerson: la receta queda COMO LA MANDÓ EL PM (no se inventa un reparto por
  diámetro) y el sistema convierte con la tabla estándar ASTM A615
  (`VARILLAS` en geocost-calc: kg/m de #2 a #11; `pesoLanceKg`,
  `kgPorUnidad` Ton/kg/qq/lb, `cantidadDeVarilla`, `nombreVarilla`,
  `textoVarilla`, `esPartidaVarillaPorPeso` = unidad de peso + nombre
  acero/varilla/hierro/refuerzo; Torre Adobe, que ya viene por lance, NO la
  activa). Línea con `varilla: {n, largo, lances}` y `cantidad` en la unidad
  de la partida. Dónde: `LineasPresupuesto` (GeoShopping: caja gris "Se compra
  en lances" con #, largo 6/9/12 y lances → llena la cantidad),
  `SolicitudFormImpl` de GeoSupply (la varilla se puede agregar varias veces,
  una línea por diámetro; `excede` suma todas las líneas de la partida;
  descripción "Varilla #5 (5/8") de 9 m · 20 lances") y `CotizacionFormImpl`
  (Ana cotiza LANCES y P.U. POR LANCE; cantidad en Ton y `puLps` por Ton se
  derivan, así el semáforo compara contra los $1,050/Ton). Descripción en
  GeoShopping/GeoCost: "1,000 lances × Varilla #5 (5/8") de 9 m · 13.97 Ton".
  Datos corregidos en la nube el 12-oct: MAT-2026-0515 era "1,000 Ton" → 1,000
  lances #5 9 m = 13.968 Ton (con `ajustaDescripcion`); MAT-2026-0416 desglosada
  en 430 #6 9 m + 245 #5 9 m + 302 #8 12 m = 26.47 Ton (descripción intacta).
  Saldo real: 46.22 − 40.44 = **5.78 Ton**. En plata la partida va $788 arriba
  ($49,319 / $48,531) por PRECIO (ECOMETAL ~$1,197/Ton vs $1,050 del PM) y
  porque el alambre de amarre (MAT-0412 y MAT-0469, $907) también carga ahí
  (Gerson: se queda ahí). Pruebas en `tests/geocost-maq.test.mjs`.
- **Accesos al sistema desde GeoTeam (2-oct-2026)**: pestaña **Accesos** (solo
  admin) en HRModule → key **`gt-usuarios`** `[{id, username, password, role,
  label (= fullName de la ficha), empId, proyectos:[shorts], activo,
  createdAt, createdBy, updatedAt, updatedBy}]`. `AccesoFormImpl` (a nivel de
  módulo): se elige el colaborador de hr-emps5, sugiere usuario
  "nombre.apellido" (`usernameSugerido`, sin acentos, único contra users.js y
  la nube) y clave `geoNNNN`, rol de `ROLES_ASIGNABLES` (users.js; admin NO se
  asigna desde ahí), proyectos como pills cuando es residente, toggle activo.
  Guardado getCloud → merge por id → set → verify. El login de App.jsx es
  ASYNC: primero USERS fijos, después `gt-usuarios` SOLO con getCloud
  (`activo !== false`); la sesión guarda `empId` y `proyectos`, que viajan en
  `moduleProps` (`userProyectos`, `userEmpId`). GeoSupply relee gt-usuarios
  al cargar, así un proyecto agregado hoy se ve sin re-loguear. La pestaña
  monta `<style>{GT_CSS}</style>` localmente para usar el vidrio (GeoTeam no
  está rediseñado). ⚠ El `useEffect` que lee gt-usuarios va ARRIBA del return
  de "Cargando…" (un hook después de un return condicional rompió el orden de
  hooks en la primera prueba).
- `GeoInventoryModule.jsx` (**GeoInventory — Inventario, ubicaciones y
  herramientas, 13-oct-2026**) + `geoinventory-calc.js` (lógica PURA,
  `tests/geoinventory-calc.test.mjs`) + `geoinventory-etiquetas.js` (PDF de
  etiquetas con QR local, paquete `qrcode`). Responde tres cosas por artículo:
  QUÉ es, DÓNDE está y CUÁNTO hay (o en qué ESTADO está). PRIMERO CELULAR
  (Óscar carga el Almacén Central caminando; Ana las oficinas; Gerson las
  herramientas de perforación). Misma estética que GeoSupply (GT_CSS, vidrio).
  **Dos tipos**: `cantidad` (cosas iguales: `stock {ubicacionId: n}`, unidad de
  las de GeoCost) e `individual` (código propio, `ubicacionId`, `estado`,
  `asignadoA` = empId de hr-emps5 + `asignadoNombre`, marca/modelo/serie; si es
  herramienta de perforación `herramienta {tipo broca|bucket|rompebolon,
  diametro}` y `maquinaId/maquinaNombre` de mq-machines cuando está en
  operación). "¿Cuántos iguales?" crea N individuales con la misma foto y
  datos, cada uno con su código. **Categorías** (6, con prefijo de código):
  materiales MAT · insumos_perforacion PER · herramientas_perforacion HER ·
  mobiliario ADM · computo TEC · otros OTR; códigos correlativos por prefijo
  asignados sobre la lista FRESCA de la nube (`siguientesCodigos`). **Estados**:
  herramientas Disponible/En operación (pide máquina)/Requiere trabajo; lo
  demás Bueno/Regular/Malo; un toque en la ficha. **Ubicaciones**
  (`ubicacionesDe`): fijas `almacen` (Almacén Central) · `vault` (GeoDrill
  Vault, sin migrar nada) · `taller` (Taller externo) + oficinas (`of:<id>`,
  las crean admin/tesorería/Ana desde Ubicaciones) + UNA POR PROYECTO
  automática (`proy:<short>`, de la lista unificada base+cp-projects); en
  `inv-ubicaciones` solo viven las oficinas y los ajustes (responsable =
  username, activa). **Historial automático**: TODO cambio pasa por
  `aplicarMovimiento(item, m)` (entrada · salida con destino/entregado a ·
  mover · ajuste · estado · asignar · editar · eliminar — valida, nunca deja
  stock negativo) y el movimiento se escribe en `inv-mov-AAAA-MM` (una key
  por mes, append con getCloud). **Guardado**: `guardarItems(fn)` aplica fn a
  la lista fresca (getCloud → set → verify por ids/updatedAt); la foto se sube
  ANTES a `cp-file-<id>` (canvas 800 px, JPEG 0.75, ~10-60 KB) y el artículo
  guarda `{fileId, name, size}`; `Foto` la carga perezosa con cache en memoria.
  **Pantallas**: Inicio (4 botones grandes Agregar/Buscar/Escanear/
  Ubicaciones + contadores + últimos movimientos) · **Agregar**
  (`AgregarFormImpl`, a nivel de módulo — ⚠ `PasoCaja` también a nivel de
  módulo: definida adentro se remontaba por tecla y el input perdía el foco):
  ubicación FIJA (localStorage `gt-inv-ubic-<user>`), foto con cámara
  (`capture="environment"`) o galería, nombre con **sugerencias contra
  duplicados** (`sugerirExistentes`: tocar "Sumar" convierte el form en
  entrada al existente; "Otro igual" copia datos y foto de un individual),
  tipo, categoría con iconos, cantidad+unidad o estado/asignado/iguales,
  botón pegajoso **"Guardar y agregar otro"** (conserva ubicación, categoría y
  unidad) · Buscar (nombre/código/serie/persona + ubicación, categoría,
  individuales, estado; Enter con un código abre la ficha — sirve para un
  lector USB/Bluetooth; botones Etiquetas (N) e Importar Excel) · Ubicaciones
  (grupos Almacén y bodegas / Oficinas / Proyectos, responsable y cuántos;
  click = Buscar filtrado; ✎ y "+ Nueva oficina" con permiso) · Herramientas
  (tablero por ubicación o tipo, pills de estado con conteo, tarjeta con foto,
  Ø, estado en color y máquina) · Movimientos (por día, buscador, "cargar un
  mes más atrás"). **Ficha** (`FichaImpl`): foto grande, código, QR (local),
  estado de un toque, ubicaciones/stock, asignado; acciones inline Entrada ·
  Salida (hacia otra ubicación y/o entregado a alguien) · Mover · Asignar/
  Devuelto · Ajustar (corrección, solo full) · Editar · Etiqueta · Eliminar
  (solo full, confirm; queda `eliminado:true` + movimiento). **QR**: la
  etiqueta codifica `<origen><BASE_URL>#inv=HER-0001`; App.jsx abre
  GeoInventory directo con ese hash (con sesión viva, o tras el login con
  rol permitido — `hashInventario`) y el módulo abre la ficha y limpia el
  hash; `EscanerImpl` usa `qr-scanner` (cámara) + campo manual. Etiquetas:
  carta, 3×8 de 2.5×1.25" (Avery 5160/8160): QR, código, nombre, ubicación.
  **Importar Excel** (`parseTabla` + `prepararImportacion`): CSV o celdas
  pegadas (tab), columnas nombre, categoria, tipo, cantidad, unidad,
  ubicacion, estado, marca, modelo, serie, asignado; resuelve ubicación y
  colaborador por nombre; plantilla descargable.
  **Permisos** (`permisosDe`, decisión de Gerson 13-oct): admin y tesorería
  TODO; `logistica` (Óscar) todo MENOS ajustar cantidades a mano (sí entradas,
  salidas, mover, asignar, estado, imprimir, importar) y, desde el 14-oct,
  SOLO en sus ubicaciones (ver ALCANCE de Óscar); `asistente_compras`
  (Ana) igual + crear oficinas; costos (Christian), compras_ops (Arturo),
  gerencia y visores SOLO VER; residentes sin acceso. `ROLES_INVENTARIO` es
  lo que usa MODULES en App.jsx.
  **GeoTeam**: `EquipoAsignadoInv` (a nivel de módulo en HRModule, lee
  inv-items SOLO con getCloud): sección "Equipo asignado (GeoInventory)" en
  Editar empleado y aviso ámbar en el form de BAJA si todavía tiene equipo.
  **Verificado el 13-oct** en viewport de celular montando el módulo con
  cada rol sobre la nube real (datos de prueba borrados después): Óscar fijó
  Almacén y cargó cemento con foto (MAT-0001, 11 KB), "cem" sugirió el
  existente y sumó 30 (150), creó una broca en VILLA SAN MIGUEL (HER-0001) y
  2 monitores iguales (TEC-0001/0002) con el primero asignado a Ana; salida de
  20 bolsas a AMICI, broca En operación en BG20H, mover y asignar, Ajustar
  oculto para Óscar; Ana creó "Oficina Operaciones" con responsable;
  Christian sin Agregar ni acciones; `#inv=HER-0001` abrió la ficha; etiqueta
  PDF generada; GeoTeam mostró el monitor en la ficha de Ana y el aviso en
  Baja. Pruebas Node: 8 (35 en total con `npm test`).
  **CAJAS Y ESTANTES (13-oct-2026, misma noche — Gerson: "las picas y
  portapicas SIEMPRE están en cajitas; necesito crear el estante, agregar las
  cajas con cuántas picas trae cada una, y que la salida se registre contra
  ESA caja leyendo su QR; son 4 estantes de 4 niveles; mañana rehago el
  inventario del Vault desde cero")**: tercer tipo de artículo `tipo:"caja"`
  — código propio **CAJ-0001** (`PREFIJO_CAJA`), `ubicacionId`, `estanteId` +
  `nivel`, y `caja {contenido (texto libre con datalist CONTENIDOS_CAJA: Pica,
  Portapica, Muela…), marca (MARCAS_CAJA), tamano jumbo|mediana|pequena,
  cantidad, capacidad}`; `nombre` = `nombreCaja()` ("Pica jumbo · Drill
  Master"). Stock de la caja = `caja.cantidad`; una caja VACÍA sigue "estando"
  en su estante (`estaEn`). `aplicarMovimiento` para cajas: **salida contra
  la caja** (cantidad ≤ lo que queda, `a` = proyecto/ubicación destino,
  `entregadoA`, guarda `contenido` en el movimiento: "−5 picas de GeoDrill
  Vault → AMICI"), entrada = rellenar (sube capacidad si se pasa), ajuste,
  mover (ubicación + estante + nivel; `deEstante/aEstante/deNivel/aNivel`).
  **Estantes** viven en `inv-ubicaciones` como `{id "est:<id>", tipo
  "estante", mueble, codigo EST-…, ubicacionId, nombre, niveles, orden, activa}` (`estantesDe`,
  `textoEstante` → "Estante A · Nivel 2"); se crean desde la pestaña
  **Estantes** ("+ Estante", prompt nombre + niveles; ✎ renombrar/niveles; ✕
  solo si no tiene cajas) o inline en Agregar ("+ Nuevo estante"). Pestaña
  **Estantes** (`renderEstantes`): selector de ubicación (Vault por defecto),
  chips de resumen por contenido (`resumenCajas`: "45 picas · 3 cajas (1
  vacía)"), "Etiquetas de las cajas (N)", y cada estante con sus niveles de
  arriba hacia abajo y las cajas como chips de color (verde llena · ámbar
  parcial · gris vacía: `nivelCaja`) — ⚠ esa pestaña se RETIRÓ el 14-oct (ver
  NAVEGACIÓN POR UBICACIONES más abajo) + "+ Caja" en cada nivel, que abre
  Agregar con ubicación, estante y nivel YA puestos (`setUltimo`). En Agregar
  la pill "Caja (picas, portapicas…)" muestra el paso "La caja": estante
  (pills) y nivel, marca, tamaño, "Cuántas trae cada caja" y "¿Cuántas cajas
  iguales?" → N cajas con código y QR propios ("Guardar 3 cajas y seguir").
  La sugerencia de una caja existente ofrece "Otra igual". La ficha de una
  caja muestra "10 de 15 picas en esta caja" en grande, el estante·nivel y
  las acciones **Salida de la caja** (cantidad, para qué proyecto, entregado
  a, nota) · **Rellenar** · **Mover** (ubicación, estante, nivel) · Ajustar
  (full) · Editar (contenido, marca, tamaño, capacidad) · Etiqueta. La
  etiqueta dice "Pica jumbo · Drill Master · 15" y "GeoDrill Vault · Estante
  A · Nivel 2". Importar Excel acepta `tipo caja` con columnas `cajas`,
  `estante` (por nombre, tiene que existir) y `nivel`. Buscar tiene la pill
  "Cajas"; Inicio suma el contador de cajas con las unidades por contenido.
  Verificado el 13-oct en celular (admin): "+ Estante" creó Estante A de 4
  niveles en el Vault; "+ Caja" del nivel 2 abrió Agregar con todo puesto y
  "Guardar 3 cajas y seguir" creó CAJ-0001..0003 (15 picas Drill Master
  jumbo, foto compartida); salida de 5 a AMICI con nota (10 de 15), rellenar
  (15), mover al nivel 3 — el tablero y la nube lo reflejaron; datos borrados
  después. ⚠ El ✕ de quitar estante lleva `aria-label="Quitar estante"` para
  no confundirse con el ✕ del modal.
  **NAVEGACIÓN POR UBICACIONES (14-oct-2026, Gerson: "la pestaña Estantes es
  ilógica; en Inicio cajitas de vidrio con las ubicaciones, pico adentro y veo
  su inventario; si tiene estantes, cajitas con los estantes, entro y salen
  los niveles, entro al nivel y salen las cajitas; cada estante, rack y nivel
  con su QR; las oficinas con un código para pegar el QR afuera")**: se
  RETIRÓ la pestaña Estantes. Pestañas: Inicio · Agregar · Buscar ·
  Ubicaciones · Herramientas · Movimientos. **Inicio** = `ruta {ubic, est,
  niv}` (estado; tocar "Inicio" estando en Inicio vuelve a la raíz):
  raíz con Escanear QR (azul) + Agregar + "Filtrar ubicaciones o escribir un
  código" (Enter con un código lo abre), tira compacta de contadores, "Tus
  ubicaciones" (donde `responsable === userKey`, resaltadas y NO repetidas
  abajo) y grupos de tarjetas `.gt-vidrio` (`tarjetaUbicacion`): Almacén y
  bodegas · Oficinas de plantel (+ Nueva oficina) · Proyectos con inventario
  (los demás tras "Ver los N proyectos sin inventario"). Todos los que entran
  al módulo ven todas (los visores también; los residentes siguen SIN
  acceso). `renderUbicacionVista` (migas, cabecera con chip del código/QR,
  Agregar aquí, + Estante / rack, Responsable; tarjetas de estantes/racks;
  "Fuera de estante" o el inventario por categoría; movimientos de aquí →
  Movimientos filtrado) → `renderEstanteVista` (tarjeta por NIVEL 1..N con
  lo que tiene, su código; Editar/Quitar; QR del estante y niveles) →
  `renderNivelVista` (cajas como `tarjetaCaja` con barra de llenado + otros
  artículos; pills para saltar de nivel; Agregar aquí con ubicación, estante
  y nivel puestos — en el Vault arranca en tipo Caja, fuera del Vault vuelve
  a Por cantidad). Proyectos y oficinas NO llevan sub-ubicaciones: todo cae
  en su inventario general (salvo que se les cree un estante).
  **Posición para TODO artículo** (`posicionDe`): individuales y cajas
  `estanteId` + `nivel`; por cantidad `posiciones {[ubicacionId]: {estanteId,
  nivel}}` (acción `ubicar` en la ficha: "Ubicar en estante"); `Mover` de
  individuales/cajas elige ubicación + estante + nivel (`PosicionPicker`).
  Helpers `itemsEnUbicacion/EnEstante/EnNivel/SinEstante`, `resumenDe`,
  `movimientosDe`. **Códigos y QR**: ubicaciones `UBI-0001` (oficina nueva lo
  recibe al crearse y se abre su QR de una; fijas y proyectos lo reciben BAJO
  DEMANDA con `asegurarCodigos` al pedir su QR — se guarda un registro
  `{id, tipo, codigo}` en inv-ubicaciones), estantes/racks `EST-0001` (al
  crearse; `mueble` estante|rack) y su NIVEL `EST-0001-N2` (`codigoNivel`).
  `resolverCodigo` + `abrirCodigo` llevan cualquier código escaneado/tipeado
  a la ficha, ubicación, estante o nivel; `#inv=` acepta todos (App.jsx no
  cambió). `QRImpl` (modal) muestra el QR grande + Imprimir etiqueta.
  **Etiquetas** (`generarEtiquetas({grandes, chicas})`, UN solo PDF —dos
  descargas seguidas las bloquea el navegador): GRANDES 4 por carta (2×2 de
  4.25×5.5", franja naranja, nombre, QR 2.6", código) para oficinas,
  bodegas y estantes; CHICAS Avery 3×8 para niveles, cajas y artículos.
  "QR de estantes y niveles" = grande del estante + chica por nivel.
  **Pestaña Ubicaciones** = administración: filas con responsable, artículos,
  estantes, chip del código/QR y ✎; "QR de almacén, bodegas y oficinas".
  **Movimientos**: filtro por ubicación (`movUbic`). **Agregar** (Gerson:
  "más compacto, aprovechemos el ancho, ese negro no me encanta"): a DOS
  COLUMNAS desde 1000 px (`dosColumnas`), tarjetas más bajas, número del paso
  en gris claro, `Segmentado` (control estilo iOS, pista gris y opción activa
  blanca) para tipo/herramienta/tamaño/nivel/mueble, foto como cuadro que
  abre la cámara + "o desde la galería", **unidad en MENÚ** (`UnidadSelect`
  con las 26 de GeoCost + "Otra…"), estante/nivel opcional para cualquier
  tipo (obligatorio para cajas si la ubicación tiene estantes) con "+
  Estante / rack" en línea. Se corrigió el placeholder que mostraba `24&quot;`.
  Verificado el 14-oct (escritorio y celular, admin y Óscar) sobre la nube
  real: Inicio con tarjetas; Vault › + Estante (EST-0001, 4 niveles) › Nivel
  2 › Agregar aquí › 2 cajas de 15 picas aparecen en el nivel; Oficina
  Operaciones nueva → UBI-0001 con su QR; Almacén › Rack A (3 niveles) ›
  cemento en nivel 3 con unidad Bolsa del menú; "EST-0001-N2" y "UBI-0001"
  tecleados abren su vista; QR del Vault generado bajo demanda (UBI-0002);
  Óscar ve "Tus ubicaciones" con el Almacén, puede Agregar y no ve Quitar;
  PDF de etiquetas revisado como imagen. Todo borrado después y el
  responsable real del Almacén (Óscar) quedó intacto.
  **Segunda foto de la caja (20-oct-2026, Gerson)**: las cajas llevan `foto2`
  OPCIONAL (cómo se ve la caja con lo que trae). Se carga en Agregar (cuadro
  "Foto de la caja"), en Editar y "Otra igual" la copia. SOLO se ve en la ficha
  (al lado de la foto principal); tarjetas y listas siguen con `foto`.
  Se PRE-DECODIFICA en segundo plano al cargar (`precalentarFoto`) para que
  salga al instante. **Condición** (20-oct-2026): campo aditivo `condicion`
  nuevo | usado_bueno | usado_malo (`CONDICIONES`) en cajas, por cantidad y
  herramientas (los individuales comunes ya tienen Bueno/Regular/Malo); se
  elige al agregar (default Nuevo, se recuerda para el siguiente), chip en la
  ficha y editable en Editar. Los artículos viejos no la traen.
  **Dar salida (26-oct-2026)**: botón carbón junto a Agregar en Inicio →
  `SalidaPickerImpl` (escanear QR o buscar; solo lo que esa persona puede
  sacar) → abre la ficha con la salida ya desplegada (`accionInicial`;
  individuales abren Mover). "Tus ubicaciones" ya NO se excluyen de su grupo
  (el Vault sale en Almacén y bodegas aunque seas su responsable).
  **Grupos plegables (14-oct-2026)**: en Inicio, "Tus ubicaciones", "Almacén
  y bodegas", "Oficinas de plantel" y "Proyectos" se compactan tocando su
  título (chevron; `cerrados` en localStorage `gt-inv-grupos-cerrados`, es
  preferencia de pantalla); con el filtro escrito se abren todos. Cada grupo
  es una FILA DE VIDRIO grande (`cabeceraGrupo`: ícono, título 17.5px,
  resumen, conteo, chevron; "+ Nueva oficina" en la de oficinas) — Gerson:
  "más grandes; minimizados se veía el vacío feo". Al desplegar Proyectos
  salen TODOS (con inventario primero), sin botón "Ver los N sin
  inventario" (se retiró). Tarjetas sin alto mínimo (más compactas).
  **ALCANCE de Óscar (14-oct-2026, Gerson: "que Óscar sí pueda ver el
  inventario de todos los proyectos pero no manipularlo, y ubicaciones")**:
  `permisosDe("logistica").alcance = "propias"` → el módulo arma `editables`
  (Almacén Central + las ubicaciones donde `responsable === userKey`) y
  `puedeEn(ubicacionId)`. Fuera de ahí Óscar SOLO MIRA: Agregar e Importar
  solo ofrecen sus ubicaciones; en las vistas no salen "Agregar aquí", "+
  Estante / rack", Editar estante ni "Generar QR" (sí ve los códigos que ya
  existen) y sale el chip "Solo lectura"; la ficha (`FichaImpl` recibe
  `puedeEn`) apaga Mover/Asignar/Estado/Editar/Salida/Rellenar de lo que no es
  suyo y muestra "lo podés ver, pero lo maneja su responsable". Lo que SÍ
  hace: salida del Almacén HACIA un proyecto (el destino puede ser cualquiera)
  y entradas a sus ubicaciones; Ajustar sigue sin tenerlo. `asegurarCodigos`
  no genera códigos de ubicaciones ajenas. Admin, tesorería y Ana siguen con
  alcance "todo". Verificado el 14-oct con datos de prueba (borrados).
  **Panel**: GeoSafety, GeoDrill Vault y Mis Tareas llevan `oculto: true` en
  MODULES (14-oct, "de momento"): no salen en el panel; el código sigue y Mis
  Tareas se abre igual desde la tarjeta TO-DOS de la bienvenida.
  **Fuera de esta versión** (dejado preparado): historial de reparaciones,
  traslados con confirmación, aprobaciones, costos/stock mínimo, conexión con
  GeoSupply/GeoShopping, migración de GeoDrill Vault (sus 76 cajas de gdv-items
  tienen el mismo shape conceptual: contenido, marca, tamaño, estante, cantidad).
- `GeoDrillVault.jsx`, `projects.js` (base + helpers), `holidays.js`, `theme.js`,
  `gt-ui.js` (GT_CSS: tokens + clases gt-* del rediseño — lo montan App y los
  módulos rediseñados, cada quien con su propio <style>).

## Claves de datos (store = supabase.js)
`cp-purchases`, `cp-projects` (proyectos custom — GeoShopping es el dueño; HR
los lee vía resolveShortHR), `cp-providers`, `cp-file-<id>` (archivos),
`cp-prioridades` (cola de pago de Tesorería — GeoShopping es el dueño;
el ORDEN del array es la prioridad), `cp-cxp` (calendarización de pagos: acá
manda la FECHA, no el orden),
`mq-purchases`, `mq-machines`, `mq-prioridades` / `mq-cxp` (las colas de pago
de GeoMachinery, separadas de las de GeoShopping), `lg-despachos` (compartido compras/máquinas/
logística; vínculo: `sourcePurchaseId`), `hr-emps5`, `hr-atts2`, `hr-cuad`,
`hr-he` (horas extras), `hr-pays`, `hr-contracts`, etc.
`gt-todos-<username>` (tareas personales — las comparten la tarjeta TO-DOS de
la bienvenida y el módulo Mis Tareas; nadie ve las de otro).
`gt-usuarios` (accesos creados desde GeoTeam → Accesos; el login los lee con
getCloud después de users.js). `hr-solicitudes` (hub de RRHH: vacaciones/permisos/
constancias/reportes que pide la gente; al aprobar alimenta hr-vacs/hr-lvs/
hr-cons) y `gt-vinculos` ({username: empId}). GeoSupply (oct 2026): `sp-solicitudes`,
`sp-cotizaciones`, `sp-config`, `sp-file-<id>`; campo aditivo `origenSupply`
en cp-purchases (borradores que vienen de una cotización aprobada).
GeoInventory (oct 2026): `inv-items`, `inv-ubicaciones`, `inv-mov-AAAA-MM`
(historial, una key por mes), fotos en `cp-file-<id>`.
GeoCost (sep 2026): `cc-config` ({tasa, historialTasa}), `cc-presupuestos`
(uno por projectCode), `cc-movilizaciones`, `cc-file-<id>` (comprobantes);
campos aditivos `partidaId` y `sobregiroJustificacion` en cp-/mq-purchases.
GeoClock (ago 2026): `gc-marks-<periodo>-<quincena>` (marcajes, ÚNICO
escritor GeoClock), `gc-firma-<markId>` (firma JPEG), `gc-foto-<markId>`
(foto automática de la tablet, 23-oct-2026), `gc-tardies`
(decisiones de RRHH sobre tardanzas, ÚNICO escritor HRModule) — ownership
separado a propósito para que tablet y RRHH nunca compitan por una key.

## Convenciones críticas
- **ESTILO ÚNICO DE REPORTES (26-oct-2026, Gerson: "todo reporte que
  exportemos, PDF o Excel, en estilo Apple")**: `src/reporte-estilo.js` es la
  ÚNICA fuente — reportes HTML para "Guardar PDF" (`reporteHTML` +
  `abrirReporte` + piezas `rKpis`/`rSeccion`/`rTabla`/`rChip`/`rBarra`/
  `rDona`), jsPDF (`PDF_TEMA`, `pdfCabecera`, `pdfPie`, `pdfKpi`, `latin1`) y
  Excel con exceljs (`libroExcel`, `hojaExcel`, `descargarExcel`; los CSV
  viejos pasaron a .xlsx). Blanco, carbón, UN naranja, grises; verde solo
  pagado/positivo, rojo solo negativo; empresas = carbón (Geotecnica) /
  naranja (Subterra); cero arcoíris y cero emojis. Convertidos: ejecutivos de
  materiales y maquinaria, Excel de máquinas, Acta de entrega, portada del
  Paquete de cierre, Ficha y Reporte de GeoCost, Planilla (PDF y Excel),
  Asistencia, Horas extras, Costos MO (+Excel), Costo ejecutivo MO,
  Movimientos (+Excel) y Registros de GeoClock (+Excel). A propósito NO: la
  constancia (calcada del Word), las etiquetas QR, GeoSafety/GeoDrill Vault
  (ocultos) y la plantilla CSV de importar de GeoInventory. Todo reporte
  nuevo usa este módulo.
  **29-oct-2026 — HORIZONTAL, sin cortes y un PASTEL por proyecto** (Gerson:
  "cada proyecto es un color, pasteles bonitos; horizontales; que no se corte
  un proyecto a la mitad; todos los reportes así"): `reporteHTML` es apaisado
  por DEFAULT; `.rp-sec`, tablas-caja y KPIs llevan `break-inside: avoid` (una
  sección que cabe en una hoja pasa entera a la siguiente; una más larga que
  una hoja sí se parte, repitiendo el thead). La hoja se pide con MEDIDAS (`@page{size: 11in 8.5in}`), NO con
  "letter landscape": con esa palabra Chrome en Windows guardaba el PDF
  vertical con el contenido girado y al abrirlo salía de lado. `PASTEL_PROYECTOS` (2ª pasada del mismo día: 12 TONOS DISTINTOS —cielo,
  verde, violeta, turquesa, lima, magenta, café, gris, durazno, amarillo,
  índigo, oliva— porque los primeros se parecían entre sí; antes: 12 tonos,
  cada uno `{bg, base, tinta}`, sin rojos ni rosados; los primeros no se
  parecen a las celdas ámbar/azul/naranja de asistencia), `pastelesDe(shorts)`
  (un tono por proyecto en el orden del reporte), logo de Subterra más grande (62 px en HTML, 16 mm
  en jsPDF: es redondo y a 30 px no se leía), la barra del reporte avisa
  "En Destino elegí «Guardar como PDF» (no «Microsoft Print to PDF»)" (ese
  driver de Windows imprime en hoja vertical y gira el contenido), `rSeccionProyecto(pc, …)`
  (cabecera tintada) y `rProyecto(pc, texto)` (pastilla). Usados en Asistencia
  (secciones, resumen, celdas "1*" y leyenda; columnas de día de ancho fijo
  para que todas las tablas queden alineadas), Horas extras (+ tabla "Por
  proyecto" con barras), Costo MO, Costo ejecutivo MO (dona), Registros de
  GeoClock y los ejecutivos de materiales y maquinaria (dona + secciones).
  jsPDF: GeoCost Ficha/Reporte pasaron a A4 HORIZONTAL (todo es relativo a
  CW) y una categoría de partidas no se parte si cabe en una hoja; la
  Planilla (ya apaisada) no parte un grupo Permanentes/Temporales/Honorarios
  si cabe en una hoja.
  **30-oct-2026 — el PDF se BAJA DIRECTO, sin el diálogo de imprimir**
  (Gerson: "cada reporte que bajo viene así", de lado): con una impresora o
  "Microsoft Print to PDF" en vertical, Windows metía la hoja horizontal girada
  dentro de una vertical, y ni el @page con medidas ni el aviso alcanzaban.
  `abrirReporte` ahora llama `descargarReportePDF(w)`: html2canvas (ya venía
  con jsPDF) dibuja la página al ancho exacto del área imprimible y jsPDF arma
  el PDF carta en la orientación correcta (`body[data-hoja]` h|v). Los cortes
  los decide `cortesDePagina` (PURA, `tests/reporte-estilo.test.mjs`): entre
  filas o bloques, una sección que cabe pasa entera a la hoja siguiente, y una
  tabla que sigue en otra hoja REPITE su encabezado. Número "n / N" al pie. El
  PDF es imagen (JPEG ×2.4, ~0.3 MB por hoja). "Imprimir" queda como botón
  aparte; si html2canvas falla, ofrece el diálogo de imprimir. Se queda vertical a propósito: el Paquete de cierre
  (portada + facturas escaneadas), la constancia y las etiquetas.
- **Constancias desde GeoTeam (26-oct-2026)**: el "+ Generar" de Solicitudes
  → Constancias abría el `ConForm` VIEJO (texto para copiar). Ahora abre
  `GenerarConstanciaImpl` (rrhh-hub.jsx): colaborador, tipo (de trabajo solo
  si !hideSalary), vista previa calcada del Word y "Generar PDF" (guarda en
  hr-cons con `doc`). Cada registro tiene botón "PDF"
  (`pdfDeRegistroConstancia`: usa `doc`, el de su solicitud, o lo rearma con
  la ficha y la fecha de emisión).
- **Aviso de versión nueva (23-oct-2026)**: GitHub Pages cachea index.html 10
  min (`max-age=600`), así que tras publicar el navegador puede mostrar la
  versión vieja. `src/version.js` (`vigilarVersion`, iniciado en main.jsx)
  relee index.html sin caché cada 2 min y al volver a la pestaña; si el
  bundle cambió, la tablet kiosco (`marcaje`) se recarga sola y los demás
  ven la pastilla naranja "Hay una versión nueva del sistema · Actualizar".
- **FECHAS: `hoyISO()` de `src/fechas.js`, NUNCA `new Date().toISOString().slice(0,10)`**
  (23-sep-2026, lo cazó Gerson). `toISOString()` es **UTC**: en Honduras (UTC-6)
  desde las **6:00 p.m.** ya devuelve el día SIGUIENTE. El caso: la Lic. Carolina
  registró el pago de INVERSIONES PINEDA el 22-sep a las 10:04 p.m. y el campo
  "Fecha del pago" venía pre-llenado con 23-sep, así que quedó fechado el 23 —
  y Supply Chain (que agrupa por `paymentDate`, correctamente) lo mostró el 23.
  El bug NO estaba en Supply Chain sino en el DEFAULT del form de pago. Estaba
  repetido en **18 lugares** (HRModule ×8, LogisticsModule ×6, GeoDrillVault ×2,
  PurchasesModule ×1, MachinesModule ×1) — todos migrados a `hoyISO()`, que usa
  `Intl` con `timeZone: "America/Tegucigalpa"` (no `toLocaleDateString` a secas:
  así da la fecha de Honduras aunque la laptop esté en otra zona, mismo criterio
  que `ahoraTegus()` de GeoClock). `diaHN(iso)` convierte cualquier timestamp al
  día de Honduras. ⚠ ÚNICA excepción legítima que quedó: la aritmética sobre una
  fecha PURA (`new Date(endDate).getTime() + 86400000` en ContractForm) — ahí
  UTC es correcto porque la entrada ya es medianoche UTC.
  **Datos históricos**: 133 pagos de cp-purchases (L 5.08M) quedaron fechados un
  día adelante. Se auditó: **ninguno cruza de mes**, así que los reportes
  mensuales y el cierre contable NO están distorsionados — solo el día exacto.
  NO se corrigieron en masa: es data contable y no se puede distinguir "el
  default la traicionó" de "eligió el día siguiente a propósito" (la
  transferencia puede aplicarse al otro día). Si hace falta, se corrigen una por
  una desde el propio form de pago.
- **Guardado robusto**: nunca fire-and-forget en datos importantes. Patrón:
  `const ok = await store.set(...)` → si falla, alert + mantener modal abierto.
- **Guardia anti-pisada del auto-refresh (20-ago-2026)** — la VERDADERA causa
  de "se confirma pero la tarjeta sigue ahí / se va a la segunda": los diálogos
  nativos (confirm/prompt) hacen blur+focus de la ventana; el focus dispara el
  auto-refresh EN PARALELO con el guardado, que lee la nube de ANTES del save
  y pisa el estado local con la foto vieja. Fix en los 3 módulos con despachos/
  compras: `lastLocalMutAtRef` se estampa en cada setPurchases/setDespachos
  (wrappers sobre `_setXRaw`); refreshFromCloud se salta (pre y post fetch) si
  hubo mutación local hace <8 s. OJO en tests E2E: interceptar confirm() oculta
  este bug — reproducirlo despachando `window.dispatchEvent(new Event("focus"))`
  tras el click.
- **Responsable de cierre contable con filtro (20-ago-2026)**: el campo
  `cierreResponsable` ahora es dropdown de USERS (form + select inline en las
  cards de "Por cerrar contable", guardado con updatePurchase + audit). El
  tablero conta se FILTRA: no-supervisores ven SUS compras + las sin asignar;
  supervisores (Purchases: admin/tesorería desde el 28-sep-2026 — antes
  admin/gerencia/visor_compras; Machines: admin/gerencia) ven todas + selector por responsable (`contaResp`,
  "__sin__" = sin asignar). Asignarle otra persona a una card la saca de tu
  vista al instante.
- **Verify SEMÁNTICO, no por count** (20-ago-2026): comparar
  `cloud.length !== light.length` post-save daba error FALSO cada vez que otro
  usuario creaba una solicitud durante los ~2 s del guardado — y el modal
  quedaba abierto, así que la compra parecía "trabada" aunque sí se había
  guardado (con 5 personas trabajando pasaba seguido). Ahora se verifica que
  TODOS los ids propios estén en la nube; si la nube trae de más, son de otro
  usuario y se incorporan al state (`setPurchases([...d, ...ajenas])`).
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
- **NUNCA `store.set(k, null)`** — la columna `value` de app_data es NOT NULL:
  el upsert revienta con 400 y le sale al usuario el banner rojo "No se
  sincronizó a la nube" aunque la operación real haya funcionado (pasó al
  borrar una llegada tarde con firma, 19-ago-2026). Para borrar de verdad:
  `store.remove(k, { quiet })` (DELETE de la fila + limpia cache local;
  `quiet: true` no dispara el banner en borrados best-effort).
- **NUNCA `window.open()` después de un `await` (10-sep-2026, caso Arturo)**:
  las fichas de recibido "no se veían" porque `FileSlot.openFile` bajaba el
  `cp-file-*` de la nube (1-5 s) y DESPUÉS abría la pestaña — Safari/iPad
  bloquean ese popup siempre y Chrome cuando vence el gesto, y el `if (w)`
  se lo tragaba en silencio. Para ver un adjunto usar `<VisorArchivo archivo
  onClose>` de `src/visor-archivo.jsx` (portal a body, zIndex 10000 — por
  encima del banner de sync 9999 —, blob URL sin fetch, "Abrir en pestaña" /
  "Descargar" SÍNCRONOS dentro del click, Esc y click en el fondo cierran,
  foco al abrir). Migrados: FileSlot y constancia/proyectos/cerradas de
  GeoShopping y GeoMachinery, card del kanban de GeoLogistics, comprobante
  de GeoCost, adjuntos EPP de GeoSafety y FileSlot de GeoDrill Vault. Los
  `window.open("", "_blank")` síncronos de los reportes HTML sí funcionan y
  se dejaron.
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
- **Regla del "1 verde" (ago 2026, aprobada por Gerson)**: (1) ENTRADA marcada
  en GeoClock = "1" al abrir la hoja (la siembra es al ABRIR, no al marcar —
  ownership por key: la tablet nunca escribe hr-atts2). La SALIDA no gatea el
  "1" a propósito (se olvida seguido; sirve para horas laboradas en Registros).
  (2) Tarde = "1" sujeto a decisión de RRHH: aprobada día completo, denegada
  proporcional; **pendiente cuenta día COMPLETO** → PayrollGen avisa con
  confirm si hay pendientes de la quincena (getCloud fresco; si la nube no
  responde avisa "no se pudo verificar" y genera igual). Guard `chk`/`chkRef`:
  bloquea botón e inputs de periodo/quincena durante el chequeo (si no, cambiar
  el periodo a mitad del await guardaba líneas de la quincena vieja con el
  periodo nuevo). (3) Día cerrado sin entrada = el HUMANO confirma el 0 —
  banner "⏰ Posibles NSP según GeoClock" en el grid (`nspSugeridos`): solo
  asignados a PLANTEL/ADMINISTRACIÓN (`esProjClock`), solo días < hoyTegus()
  donde la tablet SÍ registró alguna entrada (`diasConMarcaje` — si nadie marcó
  no sugiere nada), celda vacía y día no bloqueado por alta/baja. El botón
  aplica los 0 al BORRADOR (setData); nada persiste hasta "Guardar asistencia".
  Se decide a mano porque una ausencia puede ser permiso, vacación, INC o que
  andaba en proyecto.
- **Semana Morazánica (15-oct-2026)**: `holidays.js` → `SEMANA_MORAZANICA[año]`
  reemplaza los fijos 3/12/21 de octubre por los días que fija el Gobierno
  (2026: 8, 9 y 10; el 7 arrancó a las 12 m. y queda como día regular). Cada
  año nuevo hay que agregarlo; sin entrada se usan los fijos. Solo cambia qué
  día es feriado: lo guardado en hr-atts2 (TF del 3, etc.) NO se toca.
- Asistencia: cuadrilla por quincena es la fuente de asignaciones; domingos/feriados
  auto "1" (descanso pagado). Ciclo día regular: ""→1→0→INC→V→"" (V=vacaciones,
  día pagado, teal). Días BLOQUEADOS por alta/baja NO cuentan en totales/costos
  aunque tengan valor guardado (fix Norman 30-jul). Hora de entrada payByHour
  hasta 11:00 (José Miguel). Resumen por proyecto: personas + NSP + INC + VAC.
  PDF: "1" regular sin color; celdas con * llevan el color del proyecto donde
  trabajó ese día (`PROJ_PALETTE` SIN rojos ni rosados desde el 30-sep-2026:
  el rojo es del NSP y un "1*" en vino —Villa San Miguel— se leía como
  inasistencia; frambuesa/vino/magenta → pizarra/café/petróleo); al final "RESUMEN PARA PLANILLA" (NSP/INC/V con días y total).
- **ÚLTIMO DÍA EN LA EMPRESA (30-sep-2026, pedido de Gerson; revierte el
  "día de baja" del 14-sep)**: el `endDate` de un empleado con status
  `inactive` es el **último día que estuvo en la empresa** = hasta ese día
  (inclusive) se le paga ("para que la Lic. Carolina sepa hasta cuándo se le
  paga"). Lo que viene DESPUÉS sale en gris, domingos y feriados INCLUIDOS (no
  se le paga el descanso posterior). Helper único `fueraPorBaja(e, dStr)` =
  `dStr > e.endDate` a nivel de módulo en HRModule, espejado en
  `geocost-calc.js` (`calcCostoMOPuro`) — **si cambia uno, cambiar el otro**.
  Rótulo único en BajaForm, edición de movimiento, ficha (empleado inactivo) y
  columna del reporte de Movimientos (tabla + HTML/PDF): **"Último día del
  colaborador en la empresa"**. El form de baja muestra "se le paga hasta el X;
  gris desde el X+1" (`diaSiguiente`). La conversión a permanencia ya
  registraba la baja del temporal el día anterior al efecto (= último día), así
  que ahora es consistente. ⚠ Bajas cargadas entre el 14-sep y el 30-sep (Luis
  Felipe 22-sep, Julia 26-sep, Luis Fernando 28-sep…) se tipearon con la regla
  "primer día fuera": con la regla nueva se les paga un día más. Gerson decidió
  NO corregirlas (1-oct-2026: "será de ahora en adelante") — no re-litigar.
  **Buscador de colaborador (29-oct-2026)**: en Registrar BAJA el `<select>`
  nativo salía en blanco con los nombres cortados en Chrome de Windows (un
  select de ~1,800 px de ancho dentro del modal `wide`). `BuscadorEmpleado`
  (a nivel de módulo en HRModule): escribís nombre/cargo/DNI, tocás, y queda
  la tarjeta con "Cambiar"; Enter con una sola coincidencia la elige. En Baja
  solo ofrece a los que NO están `inactive`. También en el form de
  Bonificación (el otro select a todo lo ancho).
  `EditMovForm` SINCRONIZA `emp.endDate` y la tabla de BAJAS marca con ⚠️ las
  filas cuya ficha quedó desfasada. Solo bloquea con status `inactive`: los
  temporales ACTIVOS traen un endDate de contrato que queda viejo al renovar.
- Costos MO (HR): costo diario = (salario + bonificación) / 30 × días pagados
  (DT×2, DT2/TF×3, INC=1, NSP=0). **calcCostoMO SUMA TAMBIÉN LAS HORAS EXTRAS**
  pagadas en esa quincena (quincena vencida) — auditado 19-ago-2026 contra la
  data cruda: Subterra ago-2026 = L 334,703.68 asistencia + L 29,308.00 HE (de
  2Q julio) = L 364,011.68 exacto. La tarjeta del Dashboard decía "real, por
  asistencia" (incompleto) → ahora "asistencia + horas extras pagadas". Reporte PDF/CSV por proyecto/quincena.
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
admin=administrador/1234geo · tesorería=carolina (ago 2026: GeoTeam COMPLETO
igual que admin + super de tardanzas) · costos=christian ·
coordinador_maquinas=fernando · asistente_compras=ana · recepcion=jorge
(GeoTeam solo-fotos + fichas) · logistica=oscarpaz (GeoTeam: SOLO aprobador
de llegadas tardías de su tablet) · marcaje="Marcaje de Asistencia" (tablet
de oficina/administración: SOLO GeoClock, kiosco) · compras_ops=arturo ·
gerencia (solo lectura). El horario 7–16 se llama "Campo" en UI (key
interna sigue siendo "plantel" por compatibilidad de fichas guardadas).

Arturo (compras_ops) salió de la empresa: usuario retirado el 26-oct-2026
(`USUARIOS_DE_BAJA` en users.js: el login lo rechaza, una sesión abierta se
cierra al recargar y GeoTeam → Accesos no deja recrear ese usuario).

## Pendientes conocidos
- Duplicado Junior Josue Zambrano: RESUELTO (borrado por el usuario, ago 2026).
- GeoClock arrancó en plantel central (ago 2026) — falta cuadrilla 2Q 2026-08
  (el candado bloquea el marcaje hasta que RRHH la genere) y llenar sexo/
  horario en las fichas (KPI de género marca 0/32). Si funciona esta
  quincena, la siguiente se agrega a los proyectos.
- hr-pays: hasta el 16-oct-2026 solo tenía una planilla de prueba de
  Subterra (1Q ago, v2). La planilla real arranca con la 1Q oct-2026 que
  genere la Lic. Carolina desde el sistema.
- Ideas futuras: reasignación por día en grid HE, workflow Node 24 en
  deploy.yml, mover auth a Supabase, GeoClock como app móvil.
- **INVESTIGAR (24-sep-2026): botón "Proveedor" parece BORRAR una ficha ya
  subida.** Caso real: MAT-2026-0284 (Multitornillos, Retención-Aurea).
  Logística subió la ficha firmada el 7-sep (`delivery.fichaFile` con
  contenido). El 12-sep Ana marcó la compra como "La entrega el proveedor"
  desde Por coordinar (modal `entrega-directa`) — y `delivery.fichaFile`
  quedó en `null`, solo sobrevivió `fichaUploadedAt`. La compra quedó en
  Entregas de proveedor pidiendo una ficha que ya existía. Sospecha: el modal
  de entrega directa arma el objeto `delivery` desde cero (o con un shape que
  no preserva `fichaFile`) en vez de mergear sobre el `delivery` existente.
  Revisar el handler del modal `entrega-directa` en PurchasesModule.jsx
  (busca dónde se construye `delivery` con `entregaDirecta: true`) — debería
  hacer `{...(purchase.delivery||{}), entregaDirecta:true, arrivalAt, ...}`
  y NO pisar `fichaFile`/`fichaUploadedAt` si ya estaban. Pendiente de
  confirmar con más casos si es un patrón o fue aislado.
