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
    inline): tokens (--marca carbón, --marca-2 #E8762D, --bg #F4F4F2
    blanco griseito — el beige se retiró el 31-ago: la paleta del rediseño
    es blanco/gris/naranja/carbón y las manchas de brillo naranja/gris,
    e0/e1/e2,
    --curva cubic-bezier(.32,.72,0,1)), clases `gt-*`, keyframes solo-`from` +
    `fill-mode: backwards`, manchas de brillo 47s/59s (primos), vidrio
    `--v-fondo-foto`, `prefers-reduced-motion` respetado.
  - `LoginScreen`: slideshow crossfade 9s de fotos reales de obra
    (`public/brand/login/obra-2.jpg` + `obra-3.jpg`). **1-sep: la piladora
    se retiró ("se sigue viendo fea") — quedan el EQUIPO de espaldas con
    cascos (obra-3, 1600×1069, recuperada de git b0fdac5: el ARW original
    de Downloads está truncado y sips ya no lo lee) y la perforadora en el
    río — regeneradas desde los ORIGINALES de Downloads (image (3).jpg
    2691×3600 y 7C98965D...jpeg 1536×2048; las 5 anteriores eran 1200×1600
    verticales y el cover las estiraba pixeladas en desktop). FOTOS_LOGIN es
    [{f, pos}]: `pos` = banda visible del cover por foto (30% piladora, 62%
    río). Ken Burns en la activa, tagline "Ingeniería que
    sostiene. Proyectos que avanzan.", form vidrio, versículo del día, dots
    clickeables. Fuentes nuevas en index.html: Plus Jakarta Sans + IBM Plex
    Mono (Inter y Manrope siguen para los módulos).
  - `WelcomeScreen`: tras login, saludo XL ("Buenos días, Gerson.", hero de
    2.6 s) + `fraseDeHoy()` (FRASES neutras en género, rotan por día) que
    transiciona smooth a 3 tarjetas `.gt-vidrio` — TO-DOS (persisten en
    Supabase `gt-todos-<username>`, best-effort; input deshabilitado mientras
    carga: un add con todos===null pisaba la lista en la nube), BANDEJA
    (**EN BLANCO a propósito, 31-ago**: va a estar amarrada al mail de cada
    usuario; la versión con contadores de cp-purchases/gc-tardies vivió unas
    horas — si se retoma, leer SOLO con `store.getCloud`, NUNCA store.get:
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
  - `PanelControl` (componente propio, v2 31-ago): el H1 "Panel de Control"
    nace centrado XL y viaja a su lugar (una vez por login,
    `gt-panel-hero-done`; login/logout limpian ambos flags de hero). Header
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
  Por coordinar (kanban Ana → logística), Proveedores. Exporta `generateFichaPDF`.
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
  entrar a la pestaña — paleta SOLO naranja/carbón/gris. Selector Por
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
  emoji, ✓ en cotización/comprobante. **1-sep**: STATUSES/TREASURY/
  DELIVERY recoloreados a la paleta (naranja = requiere acción, gris =
  neutral, carbón sólido = terminado; solo color/bg — labels/order
  intactos); orden "más nueva/más vieja" SIEMPRE por numeración de código
  (regex sobre `codigo`, fallback createdAt para viejas sin código);
  header con chip de carrito SVG en vez del texto "GeoShopping". La
  lógica (filtros, orden, permisos, modales) quedó INTACTA. Fixes de la revisión adversarial: grid móvil con
  minmax(0,1fr)+minWidth:0 (la tabla nowrap inflaba el track y la pestaña
  entera paneaba); stats.montoPagadoMes clasifica por slice(0,7) UTC
  (getMonth() local corría al mes anterior los pagos del día 1 y el mismo
  número salía distinto que en el Dashboard); subrayado de pestaña con
  inset boxShadow (el marginBottom:-1 se recortaba en el overflow).
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
- `GeoDrillVault.jsx`, `projects.js` (base + helpers), `holidays.js`, `theme.js`,
  `gt-ui.js` (GT_CSS: tokens + clases gt-* del rediseño — lo montan App y los
  módulos rediseñados, cada quien con su propio <style>).

## Claves de datos (store = supabase.js)
`cp-purchases`, `cp-projects` (proyectos custom — GeoShopping es el dueño; HR
los lee vía resolveShortHR), `cp-providers`, `cp-file-<id>` (archivos),
`mq-purchases`, `mq-machines`, `lg-despachos` (compartido compras/máquinas/
logística; vínculo: `sourcePurchaseId`), `hr-emps5`, `hr-atts2`, `hr-cuad`,
`hr-he` (horas extras), `hr-pays`, `hr-contracts`, etc.
GeoClock (ago 2026): `gc-marks-<periodo>-<quincena>` (marcajes, ÚNICO
escritor GeoClock), `gc-firma-<markId>` (firma JPEG), `gc-tardies`
(decisiones de RRHH sobre tardanzas, ÚNICO escritor HRModule) — ownership
separado a propósito para que tablet y RRHH nunca compitan por una key.

## Convenciones críticas
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
