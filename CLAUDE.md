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
    `fill-mode: backwards`, manchas de brillo 47s/59s (primos), vidrio
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
  Finanzas)**: campos aditivos `fechaPagoRequerida` (YYYY-MM-DD, OBLIGATORIA
  para aprobar) y `destinoPago` ("normal" | "prioridad" | "cxp"; sin elegir:
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
- `MachinesModule.jsx` (GeoMachinery) — espejo de GeoShopping para repuestos
  (coordinador: Fernando). Mismo flujo completo incl. "Cerrar sin logística".
  **19-ago-2026**: mismo flujo de cierre contable que GeoShopping (pestañas
  Entregas de proveedor + Por cerrar contable, entrega_proveedor agregado a
  sus DELIVERY_STATUSES, EntregaDirectaFormImpl a nivel de módulo, helpers
  con key "mq-purchases" vía `subirYEnlazar`). Dashboard: sección **⚙️ Gasto
  por máquina** del mes seleccionado (por paidAt, machineId → mq-machines,
  desglose por proyecto, export CSV, aviso de pagos sin máquina vinculada) —
  para el reporte mensual de costos de Gerson.
  **Pestaña Costos + reporte ejecutivo (19-ago-2026)**: `renderCostosMaq` +
  `exportMaquinasEjecutivoPDF` + `datosCostosMes` — por PROYECTO y por MÁQUINA
  (cada máquina bajo el proyecto al que está asignada, con el detalle de cada
  pago). **PERMISOS**: `canSeeCostosMaq` = admin/gerencia/costos — **Fernando
  (coordinador_maquinas) NO ve la pestaña ni exporta**; sí ve el Dashboard y
  elige el mes, pero el CSV de "Gasto por máquina" está gateado
  (`canSeeCostosMaq || isVisorCompras` — a Arturo no se le quitó).
- `HRModule.jsx` (GeoTeam) — Empleados (fotos), Contratos (tabla por urgencia),
  Planilla, Asistencia (cuadrillas → grid 1/0/INC/DT/DT2/TF + override 1*),
  Horas Extras, Costos MO, Dashboard, KPI's, Llegadas tardías. Bonificaciones
  oculto (código intacto).
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
- `GeoDrillVault.jsx`, `projects.js` (base + helpers), `holidays.js`, `theme.js`,
  `gt-ui.js` (GT_CSS: tokens + clases gt-* del rediseño — lo montan App y los
  módulos rediseñados, cada quien con su propio <style>).

## Claves de datos (store = supabase.js)
`cp-purchases`, `cp-projects` (proyectos custom — GeoShopping es el dueño; HR
los lee vía resolveShortHR), `cp-providers`, `cp-file-<id>` (archivos),
`cp-prioridades` (cola de pago de Tesorería — GeoShopping es el dueño;
el ORDEN del array es la prioridad), `cp-cxp` (calendarización de pagos: acá
manda la FECHA, no el orden),
`mq-purchases`, `mq-machines`, `lg-despachos` (compartido compras/máquinas/
logística; vínculo: `sourcePurchaseId`), `hr-emps5`, `hr-atts2`, `hr-cuad`,
`hr-he` (horas extras), `hr-pays`, `hr-contracts`, etc.
`gt-todos-<username>` (tareas personales — las comparten la tarjeta TO-DOS de
la bienvenida y el módulo Mis Tareas; nadie ve las de otro).
GeoCost (sep 2026): `cc-config` ({tasa, historialTasa}), `cc-presupuestos`
(uno por projectCode), `cc-movilizaciones`, `cc-file-<id>` (comprobantes);
campos aditivos `partidaId` y `sobregiroJustificacion` en cp-/mq-purchases.
GeoClock (ago 2026): `gc-marks-<periodo>-<quincena>` (marcajes, ÚNICO
escritor GeoClock), `gc-firma-<markId>` (firma JPEG), `gc-tardies`
(decisiones de RRHH sobre tardanzas, ÚNICO escritor HRModule) — ownership
separado a propósito para que tablet y RRHH nunca compitan por una key.

## Convenciones críticas
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
  supervisores (Purchases: admin/gerencia/visor_compras; Machines:
  admin/gerencia) ven todas + selector por responsable (`contaResp`,
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
- Asistencia: cuadrilla por quincena es la fuente de asignaciones; domingos/feriados
  auto "1" (descanso pagado). Ciclo día regular: ""→1→0→INC→V→"" (V=vacaciones,
  día pagado, teal). Días BLOQUEADOS por alta/baja NO cuentan en totales/costos
  aunque tengan valor guardado (fix Norman 30-jul). Hora de entrada payByHour
  hasta 11:00 (José Miguel). Resumen por proyecto: personas + NSP + INC + VAC.
  PDF: "1" regular sin color; celdas con * llevan el color del proyecto donde
  trabajó ese día; al final "RESUMEN PARA PLANILLA" (NSP/INC/V con días y total).
- **DÍA DE BAJA (14-sep-2026, pedido de Gerson)**: el `endDate` de un empleado
  con status `inactive` es el **día de baja** = el PRIMER día en que ya no
  pertenece a la empresa. Ese día **y los siguientes** salen en gris, domingos
  y feriados INCLUIDOS (a un dado de baja no se le paga el descanso del domingo
  posterior). Antes se leía como "último día laborado" y se bloqueaba desde el
  día SIGUIENTE, así que a Henry (baja 5-sep) le quedaba el domingo 6 pagado y
  un NSP el 7. Helper único `fueraPorBaja(e, dStr)` a nivel de módulo en
  HRModule (reemplazó las 10 copias de `dStr > e.endDate`), espejado en
  `geocost-calc.js` (`calcCostoMOPuro`) — **si cambia uno, cambiar el otro**.
  El form de baja explica la regla y muestra cuál sería el último día laborado;
  la ficha llama al campo "Día de baja" cuando el empleado está inactivo.
  ⚠ `EditMovForm` editaba la fecha del movimiento SIN tocar la ficha, así que
  el reporte decía 5-sep y la asistencia se bloqueaba desde el 7 (caso real de
  Henry). Ahora una baja editada SINCRONIZA `emp.endDate`, y la tabla de BAJAS
  marca con ⚠️ las filas cuya ficha quedó desfasada (se arreglan abriendo ✏️ y
  guardando). La columna del reporte pasó de "Último día del colaborador" a
  "Día de baja". Solo bloquea con status `inactive`: los temporales ACTIVOS
  traen un endDate de contrato que queda viejo al renovar.
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

## Pendientes conocidos
- Duplicado Junior Josue Zambrano: RESUELTO (borrado por el usuario, ago 2026).
- GeoClock arrancó en plantel central (ago 2026) — falta cuadrilla 2Q 2026-08
  (el candado bloquea el marcaje hasta que RRHH la genere) y llenar sexo/
  horario en las fichas (KPI de género marca 0/32). Si funciona esta
  quincena, la siguiente se agrega a los proyectos.
- hr-pays vacío en producción: nunca han GENERADO planilla desde el sistema
  (por eso el ReferenceError de PayrollGen vivió inadvertido desde mayo).
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
