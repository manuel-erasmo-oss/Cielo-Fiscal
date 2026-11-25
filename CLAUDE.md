# Cielo Cloud Fiscal — Contexto de Desarrollo

Segundo producto de la suite **Cielo Cloud** (el primero es Cielo Cloud
Nómina, repo `manuel-erasmo-oss/tyui`). Herramienta de venta para
contadores/firmas que gestionan la contabilidad impositiva de múltiples
clientes: extracción OCR de facturas, Reporte 606 (compras) y 607 (ventas),
declaración ITBIS mensual (IT-1), IR-17, y proyección de ISR a pagar.

Este archivo nació en la misma sesión que Cielo Cloud Nómina, por decisión
explícita del usuario de no perder el hilo de lo ya construido allí — cada
decisión de este documento que carga directamente una lección o un patrón
de ese proyecto lo dice explícitamente.

## Por qué es un proyecto separado, no una extensión de Cielo Cloud Nómina

Repo, Firebase project y ciclo de release independientes — mismo criterio
que el usuario confirmó al plantear la idea ("un proyecto distinto"). Cada
producto se vende y se despliega por separado; lo único que se comparte a
propósito es el lenguaje visual (ver abajo).

## Diferencia arquitectónica clave frente a Cielo Cloud Nómina

Cielo Cloud Nómina es `output: 'export'` — 100% estático, todo en
`localStorage` del navegador, sin servidor, porque el modelo es "una
empresa, su propia nómina, en su propio navegador". **Este producto NO
puede ser así**, por dos razones reales:

1. **OCR con IA requiere backend.** La extracción de facturas usa un
   modelo con visión (ver `src/app/api/ocr/route.ts`) — la API key de
   Anthropic no puede vivir en el cliente sin quedar expuesta a cualquiera
   que abra las dev tools. Tiene que llamarse desde una API route (servidor).
2. **Multi-tenant real.** Un contador gestiona N clientes, cada uno con sus
   propios documentos/reportes — eso pide base de datos real (Firestore),
   no `localStorage` por navegador. Las imágenes/PDFs de factura necesitan
   almacenamiento en la nube (Firebase Storage), no `localStorage` (límite
   de tamaño, y no sirve si el contador cambia de computadora).

**Stack**: Next.js 15.5.29 App Router + TypeScript strict + Tailwind (SIN
`output: 'export'`) — despliegue en Vercel o Firebase Hosting con soporte
de frameworks web.

**Nota deliberada sobre la versión de Next.js**: Cielo Cloud Nómina está
fijo en 14.2.5 (correcto para ese proyecto — es una app sin servidor, el
riesgo de un CVE de servidor no aplica igual). Este producto SÍ tiene
backend real con datos fiscales sensibles de clientes, y toda la línea
14.x (incluso su último patch, 14.2.35) carga varias vulnerabilidades
críticas de RCE no autenticado (GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4,
GHSA-2464-fhr4-w9xw — solo corregidas en 15.5.24+) — confirmado con
`npm audit` al armar este scaffold. Por eso se usa 15.5.29 desde el día
uno, no 14.x por paridad ciega con el otro producto. React se mantiene en
`^18` (Next 15.5 todavía lo soporta como peer dependency, sin forzar
React 19) para minimizar fricción. `npx tsc --noEmit` y `npm run build`
quedaron limpios con esta combinación. Firebase Auth (cliente) + Firestore + Storage (cliente,
vía reglas de seguridad por `contadorUid`) + Firebase Admin SDK dentro de
las API routes para las operaciones que requieren confianza del servidor
(llamar a Anthropic, verificar el ID token, escribir con privilegios de
admin). Ver `.env.example` para las variables necesarias.

## Decisión de arquitectura del MVP (2026-11-15) — MANDA SOBRE LA SECCIÓN ANTERIOR

La sección anterior describe el **producto final** (Firebase Auth +
Firestore + Storage, multi-tenant real). El usuario decidió, con la opción
recomendada y confirmada explícitamente, que el **MVP arranca híbrido**:

- **Datos en el navegador** (`localStorage`), igual que Cielo Cloud Nómina.
  Sin cuentas, sin Firebase todavía.
- **Una sola pieza de servidor**: `POST /api/ocr`, porque la API key de
  Anthropic no puede vivir en el navegador. Por eso se despliega en
  **Vercel** y no en GitHub Pages (Pages solo sirve archivos estáticos).
  (Desde el 2026-11-18 hay una segunda, `POST /api/verificar-dgii`, porque
  la DGII no deja que otra página web la consulte desde el navegador.)
- El desarrollo sigue siendo en estas sesiones en la nube + GitHub; "local"
  se refiere a dónde se guardan los datos del contador, no a dónde se
  desarrolla.

Por qué: el OCR es lo que vende el producto y lo de mayor riesgo, así que
conviene probarlo con facturas reales cuanto antes, sin esperar a montar
Firebase, auth y reglas de seguridad.

Consecuencias que hay que respetar mientras dure el MVP:

1. **Toda lectura/escritura de datos pasa por `Repositorio`**
   (`src/lib/datos/repositorio.ts`). Las pantallas nunca tocan
   `localStorage` directo. Migrar a Firestore = escribir otra
   implementación de esa interfaz (ya es asíncrona a propósito), no rehacer
   pantallas. No romper esta regla.
2. **`contadorUid` se conserva en todos los registros** con el valor fijo
   `CONTADOR_LOCAL = 'local'`, para no cambiar la forma de los datos al
   migrar.
3. **La ruta OCR se protege con un código de acceso compartido**
   (`OCR_CODIGO_ACCESO`), no con cuentas. Es protección de MVP: sirve para
   que un desconocido no gaste la API key, no para distinguir usuarios. No
   hay límite de uso por persona.
4. **Las imágenes de las facturas se guardan en el navegador** (IndexedDB),
   una por factura, detrás de la misma interfaz `Repositorio`
   (`guardarArchivo` / `obtenerArchivo`). Así se puede revisar una factura
   contra su original días después. Al servidor solo viajan para que la IA
   las lea, y este no las conserva. (Hasta la captura por lotes no
   se guardaban; se cambió porque revisar cientos de facturas no se termina
   en una sentada. Decisión propia, coherente con "datos en el navegador".)
5. **Limitación conocida y aceptada**: los datos viven en un solo navegador
   y se pierden si el usuario borra los datos del sitio. No hay respaldo ni
   exportación todavía.

Firebase (cliente y Admin) se quitó del proyecto en esta decisión. La
versión que lo tenía cableado está en el commit `6e89a90`
(`src/lib/firebase.ts`, `src/lib/firebase-admin.ts`, y la ruta OCR leyendo
de Storage con verificación de ID token) para cuando llegue la migración.

## Identidad visual compartida con Cielo Cloud Nómina

Copiada literalmente (no "inspirada de lejos") de los archivos de
configuración reales de ese proyecto en el momento de crear este:

- Paleta `cielo.navy` `#1B2980` / `cielo.green` `#00E676` + escala
  50/100/200/700/800/900 — `tailwind.config.ts`.
- Tipografía Inter con `font-feature-settings: 'cv02','cv03','cv04','cv11'`
  — `globals.css`.
- `darkMode: 'class'`, mismas animaciones base (`modal-in`, `backdrop-in`,
  `toast-in`/`toast-out`, `content-in`, y el lenguaje cinematográfico de
  auth: `ken-burns`, `float-slow`/`float-slower`, `auth-card-in`).
- `BTN_PRIMARY` (gradiente `from-[#1B2980] to-[#2f3fa8]` + hover-lift +
  sombra tintada) — mismo helper en `src/lib/utils.ts`.
- El isotipo (arco punteado + punto interior) replicado en `page.tsx` como
  placeholder — cuando se construya el Sidebar real, reutilizar el SVG
  exacto de `Sidebar.tsx` de Cielo Cloud Nómina, no redibujarlo de memoria.

Lo que NO se comparte (todavía): código, monorepo, Firebase project,
`localStorage`. Si en el futuro hay 2-3 productos reales, vale la pena un
hub/landing de "Cielo Cloud Suite" con selector entre productos — fase
posterior, no de este arranque.

## Lecciones heredadas directamente de Cielo Cloud Nómina (no repetir)

1. **Fechas solo-fecha ("YYYY-MM-DD") NUNCA con `new Date(isoString)`
   directo.** Se interpreta como medianoche UTC — en RD (UTC-4, sin horario
   de verano) cae en la noche del día calendario ANTERIOR en cuanto se le
   pide cualquier componente local. Le costó una sesión completa de fixes
   sistémicos a Cielo Cloud Nómina (fechaIngreso, vencimientos, licencias,
   etc.). Aquí es igual de crítico: fecha de factura, vencimiento de
   ITBIS/IR-17 (día 10/20 del mes siguiente), cierre fiscal del cliente.
   `parseFechaLocal`/`hoyLocalISO` en `src/lib/utils.ts` ya están escritos
   con esto resuelto desde el día uno — úsalos siempre, no reintroducir
   `new Date(iso)`.
2. **Nunca inventar un parámetro legal de memoria.** Cada tasa/tope/fecha
   límite en `dgii-fiscal.ts` que no viene de una fuente oficial consultada
   EN esta sesión está marcada explícitamente `⚠️ SIN VERIFICAR`. Antes de
   codificar el layout exacto de 606/607/IT-1, traer el manual/Norma
   General vigente de la DGII — mismo criterio que se aplicó en Cielo
   Cloud Nómina antes de implementar Retribuciones Complementarias (se
   pidió la Guía del Contribuyente No.14 real antes de tocar código) e
   IR-17 (confirmado contra esa misma guía, día 10, recargo 10%+4%+1.10%).
   **Ese recargo ya no rige**: la Ley 30-26 lo cambió a 3% por mes con
   tope de 100%, más un interés indemnizatorio que fija la DGII cada año
   (ver `docs/dgii/marco-legal.md`). Cielo Cloud Nómina también lo usa.
3. **Snapshot inmutable al momento de declarar, no recalculado después.**
   Cielo Cloud Nómina aprendió esto por las malas con
   `PeriodoNomina.resultadosPorEmpleado` (una nómina ya cerrada no debe
   cambiar si el salario del empleado cambia después) y lo reforzó con la
   regla "un período cerrado/pagado no se altera jamás, solo deshaciendo el
   pago primero". Aplica igual aquí: una `DeclaracionITBIS`/`ReporteFormato606607`
   ya `declarado: true` es un registro histórico — no debe recalcularse en
   vivo si se edita una factura después. Diseñar el guard de datos (no solo
   de UI) desde el principio, no como fix posterior.
4. **Snapshot de edad/confianza en el documento, no solo en la UI.** El
   patrón `confianzaOCR`/`camposIncompletos` en `DocumentoFiscal` existe
   para que la UI pueda exigir revisión manual antes de incluir una
   factura en un reporte declarado — mismo espíritu que la auditoría
   pre-cierre de Nómina (alertar antes de comprometer un cálculo, no
   confiar ciegamente en el dato de entrada).
5. **Rigor de documentación.** Este archivo se actualiza con cada sesión de
   trabajo real, con números verificados en pantalla/consulta real cuando
   aplique — no solo "implementado", sino qué se probó y con qué resultado.
   Mismo estándar que el `CLAUDE.md` de Cielo Cloud Nómina.
6. **Decisiones de producto ambiguas se confirman con el usuario antes de
   codificar**, con una opción recomendada — no se asume en silencio. Mismo
   patrón usado repetidamente en Cielo Cloud Nómina (suspensión de
   contrato, préstamos Art. 318, etc.).

## Modelo de datos (`src/types/index.ts`)

- `ClienteFiscal` — la empresa/persona gestionada, con `contadorUid` para
  el aislamiento multi-tenant (reglas de seguridad de Firestore deben
  exigir que `contadorUid === request.auth.uid` en cada lectura/escritura).
- `ClienteFiscal.actividad` (opcional): a qué se dedica el cliente; se le
  pasa a la IA para distinguir costo, gasto y activo.
- `DocumentoFiscal` — una factura (compra o venta). Sus campos siguen las
  columnas del 606 (compras) y del reporte de ingresos (ventas); los que no
  aplican a su tipo quedan en `null`. Lleva `origen` (`ocr` | `qr` |
  `manual`), `confianzaOCR` y `camposIncompletos` (las "observaciones":
  lo que falta o quedó en duda). La imagen NO va embebida: en el MVP vive
  en IndexedDB por id de documento; `archivoNombre`/`archivoPagina` dicen
  de dónde salió y `archivoPath` queda para Storage.
- `ReporteFormato606607` — snapshot mensual pensado para "marcar como
  declarado". **Definido pero sin uso todavía** (ver dudas abiertas).
- `DeclaracionITBIS`, `DeclaracionIR17`, `ProyeccionISR` — ver comentarios
  inline en el propio archivo.

## Motor fiscal (`src/lib/dgii-fiscal.ts`)

Confirmado/reutilizado de Cielo Cloud Nómina (ya verificado allá contra
fuente oficial): ISR personas jurídicas 27%, tramos de ISR personas
físicas (Ley 11-92, mismos 4 tramos que el motor de nómina), Impuesto
Sustitutivo de Retribuciones Complementarias 27%, día límite IR-17 (10,
confirmado contra la Guía No.14 DGII).

**Verificado el 2026-11-18** contra el Código Tributario (texto consolidado
de la DGII, octubre 2025), la **Ley 30-26** y el Decreto 293-11 (detalle en
`docs/dgii/marco-legal.md`): **ITBIS general 18%** (confirmado por el
usuario; la Ley 30-26 no toca los arts. 341 y 345); tasa reducida 16% para
una lista cerrada de bienes (art. 345 párr. II, no modelada); IT-1 en los
primeros 20 días (art. 353 c y Decreto 293-11 art. 24); ISR jurídicas 27%
desde 2026 con **30% transitorio 2026-2028** para ingresos desde RD$1,000
millones (Ley 30-26 art. 15); **escala nueva de ISR de personas físicas
desde 2027** (Ley 30-26 art. 10); **recargo por mora 3% mensual con tope de
100%** (Ley 30-26 art. 7, reemplaza el 10% + 4%). El día de los formatos
606 y 607 **es el 15**.

**Pendiente de verificación oficial antes de producción**:
- Montos de la escala de ISR de personas físicas hasta 2026 (vienen de
  Nómina; el art. 296 viejo trae la escala de 2012 ajustable por inflación).
- Porcentajes de retención del art. 309 según la Ley 30-26: el texto
  recibido es un OCR con ruido.

**Ya verificado con fuente oficial (2026-11-15)**: layout de los archivos
606 y 607 — ver la sección "Formatos 606 y 607" y
`docs/dgii/formatos-606-607.md`.

## Requisito de captura (dicho por el usuario el 2026-11-15) — construido

El cliente va a subir **tres tipos de entrada**, y el sistema tiene que
soportar las tres:

1. **Fotos tomadas con el celular.**
2. **Un PDF con una sola factura.**
3. **PDFs con cientos de facturas.**

**Estado**: los tres casos están cubiertos. Una foto o un PDF de una
factura se sube en Facturas → "Nueva factura"; un PDF de hasta 100 páginas
o varias fotos, en "Subir lote", donde la IA lee todo automáticamente (ver
"Captura por lotes"). Lista de variables que se tuvo en cuenta; lo que
sigue sin tratar está en "Pendiente de la captura":

- **Foto de celular**: rotada o de lado, torcida, con sombra o reflejo,
  borrosa, cortada; papel térmico desteñido; factura manuscrita; más de
  una factura en la misma foto; formato HEIC de iPhone (la API solo acepta
  JPEG/PNG/GIF/WebP y no todos los navegadores lo decodifican).
- **PDF**: digital (con texto) o escaneado (solo imagen); una factura que
  ocupa varias páginas; varias facturas en una página; páginas que no son
  facturas (portadas, estados de cuenta, páginas en blanco); páginas en
  distinta orientación; compras y ventas mezcladas; varios meses
  mezclados; facturas repetidas dentro del mismo PDF o ya registradas.
- **Tamaño y tiempo**: un PDF de cientos de páginas no se puede enviar
  entero (límite de cuerpo de Vercel y de 600 páginas por solicitud de la
  API) ni procesar en una sola llamada. Hay que partirlo en el navegador y
  procesarlo por partes, con progreso visible, reintento de las partes que
  fallen y posibilidad de retomar sin volver a pagar por lo ya leído.
- **Costo**: con cientos de páginas por cliente y por mes, la elección de
  modelo (`MODELO_OCR`) deja de ser un detalle. Hay que medir costo y
  precisión por página con facturas reales antes de fijarla.
- **Revisión a escala**: resuelto en "Objetivo del sistema" (abajo): la
  persona solo interviene en las facturas con observaciones y aprueba las
  demás con un clic.
- **Imagen durante la revisión**: resuelto, las imágenes se guardan en
  IndexedDB (decisión 4 del MVP).
- **Volumen en `localStorage`**: sirve para miles de facturas, no para
  decenas de miles. Vigilarlo.

## Objetivo del sistema (dicho por el usuario el 2026-11-17) — MANDA

> "El objetivo de hacer este sistema es que la IA llene los formatos de
> envío, es decir que lea la factura y llene los campos excepto en los
> cuales se necesite intervención humana."

Consecuencias de diseño (implementadas):

- **La IA lee todas las facturas automáticamente** al subirlas (lote o
  una por una). No es un botón opcional ni página por página.
- La IA decide sola si la factura es una **compra o una venta** del
  cliente (por quién aparece como emisor y quién como comprador) y si una
  página **no es una factura**.
- **La persona solo interviene donde hace falta**: cada factura queda con
  sus "observaciones" (`observaciones()` en `src/lib/lote/borrador.ts`):
  campos que el formato exige y faltan, campos de los que la IA dudó, y
  montos que no suman el total. Sin observaciones = lista.
- **Aprobación en bloque**: las facturas sin observaciones se aprueban con
  un clic (al terminar el lote, y en Facturas con el botón "Aprobar las
  N"), con confirmación. Esto reemplaza la idea inicial de revisar todo
  una por una (lección 4): la revisión humana se concentra donde la
  máquina no está segura. **Confirmado por el usuario el 2026-11-18**
  ("me parece bien que se aprueben en bloques"). Lo que sigue exigiendo
  persona: retenciones (decisión del usuario), y cualquier factura con
  observaciones.

## Separación por empresa (pedida por el usuario el 2026-11-18) — construida — MANDA

> "Para mí es fundamental la separación de los datos entre empresas, como
> los usuarios generalmente serán contadores independientes es fácil
> actualmente confundirse y meter información de una empresa en otra."

El usuario mostró como referencia la pantalla de inicio de otro producto
(un "espacio del contador" con la lista de empresas de sus clientes y un
botón para entrar a cada una). **No se copió**: se tomó la idea. La captura
traía nombres y RNC reales de sus clientes: no van al repo.

Decisión (con la opción recomendada): **solo la selección de empresa, sin
cuentas todavía**; el inicio de sesión llega con la migración a la nube
(paso 9 del roadmap).

- **`/` = "Tus empresas"** (`src/app/page.tsx`): lista de empresas con
  buscador (nombre, nombre comercial o RNC con o sin guiones), filtro "Con
  facturas por revisar", "Añadir empresa", botón "Entrar" y menú ⋮ (editar,
  eliminar con aviso de que se borran sus facturas). Reemplaza al Inicio y
  a la pantalla de Clientes de antes.
- **Los módulos solo existen dentro de una empresa**: `/empresa/<id>`
  (Dashboard), `/empresa/<id>/ingresos` y `/empresa/<id>/costos-gastos`
  (cada uno con su captura por lotes en `/lote`; ver "Ingresos y Costos y
  gastos") y `/empresa/<id>/reportes`. La empresa va en la dirección, no en un estado
  oculto: cada pestaña queda atada a una empresa. Las direcciones viejas
  (`/clientes`, `/facturas`, `/lote`, `/reportes`) llevan a "Tus empresas"
  (`next.config.mjs`). Una dirección con un id que no existe muestra "Esta
  empresa no existe" y ninguna pantalla de trabajo
  (`src/app/empresa/[id]/layout.tsx`).
- **La separación está en los datos, no solo en la pantalla**:
  `src/lib/datos/empresa.ts` (lógica pura, probada) +
  `src/lib/datos/empresa-context.tsx`. Dentro de una empresa las pantallas
  usan `useEmpresaActiva()`, nunca `useDatos()`: solo ven sus facturas, y
  guardar, borrar o abrir la imagen de una factura de otra empresa lanza
  `EmpresaEquivocadaError`. **No usar `useDatos()` en pantallas de
  trabajo.**
- Se quitaron los selectores de cliente de Facturas, Subir lote, Reportes y
  del formulario de factura (ahí la empresa es un campo de solo lectura):
  una factura no se puede pasar a otra empresa.
- Siempre visible dentro de una empresa, **en un solo lugar**: en
  computadora, el bloque "Empresa activa" del menú lateral (nombre, RNC y
  "Cambiar de empresa"; con el menú colapsado, el monograma lleva a "Tus
  empresas"); en móvil, que no tiene menú lateral, una línea compacta
  arriba con el nombre, el RNC y "Cambiar". La franja "Trabajando en …"
  del encabezado **se quitó el 2026-11-18** por redundante (pedido del
  usuario: "quita esto, no hay que redundar").
- Al entrar a una empresa se ve su **Dashboard** (antes "Resumen" y luego
  "Tablero"; ver "Dashboard de la empresa", abajo).
- Refuerzo que ya existía: en la captura por lotes, una factura cuyo QR
  nombra a otro contribuyente no se deja guardar.

### Diseño premium de esas pantallas (pedido por el usuario el 2026-11-18)

> "Estamos creando un producto premium y debe verse como tal ... ahora mismo
> es muy fácil identificar que lo hecho hasta ahora fue hecho con Claude."

Hecho sin romper el sistema visual: misma paleta (`#1B2980`, `#2f3fa8`,
`#00E676`), Inter, modo oscuro, y las clases compartidas de siempre (no se
tocó `tailwind.config.ts` ni `globals.css`; solo utilidades de Tailwind).

- **Monograma** (`src/components/ui/Monograma.tsx` + `src/lib/monograma.ts`,
  probado): iniciales de la empresa sin la forma jurídica ni conectores, en
  un tono propio y estable (lo fija el id). Se usa en la lista, la ficha, la
  franja "Trabajando en" y el menú lateral.
- **Tus empresas**: encabezado de marca en azul degradado con el arco del
  isotipo como marca de agua, saludo según la hora y tres indicadores
  (empresas, facturas por revisar, por verificar en la DGII); buscador y
  filtro segmentado "Todas / Por revisar"; filas tipo tarjeta con monograma,
  RNC, tipo de persona, estado ("N por revisar" o "Al día") y "Entrar →".
- **Resumen de la empresa** (reemplazado por el Tablero el mismo día): ficha con monograma, RNC y actividad; tarjeta
  "Próximo vencimiento" con los días que faltan para el 606 (en rojo a 3
  días o menos); indicadores con acento de color; accesos directos (Subir
  lote destacado, Revisar facturas, Generar reportes); y "Requieren tu
  atención": hasta 6 facturas pendientes, primero las rechazadas o
  inexistentes en la DGII, después las que hay que verificar a mano y luego
  las que tienen datos por revisar.
- Revisado en capturas en claro, oscuro y móvil (iPhone 13), sin
  desplazamiento horizontal. En móvil los indicadores van en una fila
  compacta.
- **Decidido por el usuario el 2026-11-18** ("me gustó puedes actualizar los
  otros módulos"): el mismo estilo llegó a Facturas, Subir lote y Reportes,
  y el Resumen se cambió por un tablero (siguiente sección).

### Dashboard de la empresa y estilo premium en los módulos (2026-11-18)

**Nombre**: se llamó "Tablero" hasta que el usuario pidió, el mismo día,
"cambia la palabra tablero por dashboard, es más profesional". En la
interfaz (menú, título, textos) dice **Dashboard**; las secciones de abajo
que dicen "tablero" se refieren a esa misma pantalla.

> "En vez del resumen ... me gustaría que saliera un dashboard profesional
> que se vea todo premium."

- **Tablero** (`src/app/empresa/[id]/page.tsx`; cálculos en
  `src/lib/dashboard.ts`, lógica pura con 12 pruebas; gráficos en
  `src/components/dashboard/Graficos.tsx`, SVG/HTML a mano, sin librería
  nueva). De arriba abajo:
  - (Reemplazado el mismo día por el **calendario fiscal**, ver su
    sección.) Encabezado de marca **solo con los tres próximos vencimientos**. Al
    principio traía la empresa (monograma, nombre, RNC, tipo, actividad) y
    accesos; se quitaron porque el nombre y el RNC ya están en la franja de
    arriba y en el menú (pedido del usuario: "quita esa repetición"), y el
    título de la página ya no lleva el nombre comercial sino "Resumen fiscal
    de la empresa". Los **tres próximos vencimientos** con los días que faltan: IT-1 (día 20), IR-17 (día 10) y
    606 (día 15). Cada uno es el del mes pasado mientras su día no haya
    pasado; si ya pasó, el del mes en curso (`proximosVencimientos`).
  - **Un solo filtro, el período**, arriba de todo lo que afecta (flechas +
    lista de los meses con facturas). Por defecto, el período del 606 en
    curso si ya tiene facturas; si no, el último que tenga.
  - Indicadores del período: compras y ventas sin impuestos (con cantidad y
    variación contra el mes anterior; solo en ventas subir es "bueno"),
    ITBIS en compras (y en ventas) y **diferencia de ITBIS, marcada como
    orientativa**: ventas menos compras, no la IT-1 (no aplica
    proporcionalidad, retenciones ni saldos a favor).
  - "Compras y ventas": columnas agrupadas de los últimos 6 meses, un solo
    eje, tooltip al pasar el cursor o con el teclado, botón "Tabla", y tocar
    un mes lo vuelve el período.
  - "Listo para el 606": % de facturas del período revisadas (la cifra
    grande de la pantalla), barra de estados y conteo de revisadas, por
    revisar, por verificar en la DGII y rechazadas o inexistentes; botón a
    Facturas, o a Reportes si todo está revisado.
  - "En qué se fueron las compras": costo / gasto / activo (y sin
    clasificar) según `clasificacionContable`, en una barra segmentada.
  - "Principales proveedores": los 5 de más monto (agrupados por RNC) y
    "Otros".
  - "Requieren tu atención" (de todos los meses, lo más grave primero).
  - Reglas de los montos: sin impuestos; las notas de crédito (B04/E34)
    restan; las descartadas no cuentan; las pendientes sí (el tablero dice
    cuántas hay).
  - Colores de los gráficos validados con el script de la guía de
    visualización (contraste ≥ 3:1 y separación para daltonismo, en claro
    y en oscuro): compras/gasto índigo `#3446c4` (oscuro `#6b7cf0`),
    ventas/costo `#0f9f8a` (`#1aa58c`), activo `#c8590f` (`#de6e2e`). Los
    estados usan su propia paleta, siempre con ícono y texto.
  - En el menú, "Resumen" pasó a llamarse "Tablero" y luego "Dashboard".
  - En pantallas angostas la variación de cada indicador baja a otra línea
    para que la etiqueta no se corte.
- **Estilo compartido**: `src/components/ui/clases.ts` refinado (tarjetas
  `rounded-2xl` con sombra mínima, campos con halo de foco de la marca,
  botones secundarios blancos) y piezas nuevas en
  `src/components/ui/premium.tsx`: `Cifra`, `Segmentos` (selector
  segmentado), `Estado` (píldora con ícono), `AccionSugerida` y `Pasos`.
  Siguen sin tocarse `tailwind.config.ts` y `globals.css`.
- **Facturas**: cuatro cifras (facturas, por revisar, monto sin impuestos,
  total facturado), filtros en una fila (estado con conteos, tipo, mes,
  "Quitar filtros"), "Aprobar las N" y "Verificar en la DGII" como acciones
  sugeridas (la segunda con barra de avance), y tabla con ícono de compra o
  venta, NCF y fecha juntos, **un solo estado por fila** (el más grave:
  rechazada > revisada > verificar en la DGII > por revisar) y clic en la
  fila para abrirla.
- **Subir lote**: los tres pasos siempre a la vista (hecho / actual / por
  venir), zona para soltar archivos rediseñada, resumen del resultado con
  "listas" y "con observaciones" destacadas, y pantalla final de éxito.
- **Reportes**: el reporte se elige con dos tarjetas (606 / Ingresos), el
  mes abre en el período del 606 en curso, y el resumen del reporte trae
  estado "Completo" o "Incompleto", vencimiento y totales.

### Ingresos y Costos y gastos (pedido por el usuario el 2026-11-18, construido el 2026-11-19) — MANDA

> "Vamos a hacer un cambio con el módulo facturas, en vez de eso tendremos
> uno que se llame Ingresos y otro que se llame Costos y Gastos. En costos y
> gastos se suben las facturas del 606 y en ingresos las que forman parte
> del reporte de ventas. Quiero que te inspires y parezca realmente los
> módulos de ERP profesionales como QuickBooks."

- **"Facturas" ya no existe.** Menú de una empresa: **Dashboard, Ingresos,
  Costos y gastos, Reportes** (`src/lib/nav-items.ts`, `src/lib/modulos.ts`).
  Rutas `/empresa/<id>/ingresos` (ventas) y `/empresa/<id>/costos-gastos`
  (compras del 606), cada una con su `/lote`. Las viejas redirigen
  (`next.config.mjs`): `/empresa/<id>/facturas` → costos-gastos y
  `/empresa/<id>/lote` → `costos-gastos/lote`.
- Un solo componente para los dos: `src/components/comprobantes/
  ModuloComprobantes.tsx` (+ `piezas.tsx`), con la lógica pura en
  `src/lib/comprobantes.ts` (agrupar por contraparte, ordenar, paginar, CSV,
  totales por estado; 14 pruebas). Toda la lógica de antes se conserva
  (verificar en la DGII, aprobar en bloque, `FacturaModal`, borrar).
- Estilo ERP inspirado en QuickBooks (sin copiarlo):
  - **Barra de estados con montos** (Por revisar, Verificar en la DGII,
    Rechazadas, Revisadas): total con impuestos y cantidad; tocar un bloque
    filtra, tocarlo otra vez quita el filtro.
  - **Pestañas** "Facturas" y "Proveedores" (o "Clientes"): tabla agrupada
    por RNC con cantidad, monto, ITBIS, última factura y por revisar; tocar
    una fila filtra las facturas de esa contraparte.
  - Barra de herramientas: búsqueda (nombre, RNC con o sin guiones, NCF),
    estado, mes y, en Costos y gastos, clasificación (Costo / Gasto /
    Activo / Sin clasificar).
  - Tabla con selección y **acciones en grupo** ("Aprobar (N aprobables)",
    con las mismas reglas de "Aprobar las N"; "Exportar CSV"; "Eliminar",
    con confirmación), columnas ordenables, **25 por página**, menú ⋮ por
    fila y totales del filtro. Un solo estado por fila, el más grave. Las
    notas de crédito salen en negativo y restan. En móvil, tarjetas.
  - "Agregar facturas ▾" → "Una factura" (el formulario abre con Compra o
    Venta según el módulo: `FacturaModal.tipoInicial`) o "Un lote".
- **Cada módulo registra solo su tipo — MANDA** (decisión del usuario,
  2026-11-19: "en ingresos solo se registren facturas de ventas, si la IA
  identifica una factura de gasto subida por este módulo necesito que sea
  descartada, que mande la alerta para que el usuario revise y descarte ...
  todo tiene que quedar independiente"). Reemplaza lo que hizo el agente
  el mismo día (guardar la factura del otro tipo en el otro módulo):
  - La IA y el QR siguen decidiendo si es compra o venta, pero una factura
    del otro tipo **no se guarda**. En el lote queda "Descartada"
    (`EstadoPagina` `otro_modulo`, `ContextoLote.tipoModulo`), no se puede
    incluir, no se envía a la IA si el QR ya lo dijo, y arriba sale el
    aviso "1 es una factura de venta y se descartó: en Costos y gastos solo
    se registran compras…" con enlace al otro módulo.
  - Factura suelta: el formulario abre con el tipo fijo
    (`FacturaModal.tipoFijo`; sin botones Compra/Venta, y en edición el
    tipo no se cambia). Si la IA o el QR dicen que es del otro tipo, aviso
    "Esta factura es de compra (gasto). En Ingresos solo se registran
    ventas…" con "Descartar" (cierra sin guardar) y "Elegir otro archivo".
    Si el QR dice que sí es del módulo y la IA la leyó al revés, se usan
    solo los datos del QR.
  - Guardia en los datos: `exigirTipoDeModulo` / `TipoEquivocadoError`
    (`src/lib/comprobantes.ts`, probadas) antes de guardar en el módulo y
    en el lote.
- **Ventas: consumidor final y pertenencia** (decisión del usuario,
  2026-11-19: "no debes registrar ventas como consumidor final por el mero
  hecho de no ver nombre ni RNC; primero comprobar que la venta pertenezca
  a la empresa, luego que tenga un comprobante para consumidores finales,
  E32 si es electrónico y B02 si no lo es"):
  - Pertenencia: una venta es de la empresa solo si la emitió ella (QR
    `RncEmisor`, o la IA leyó el RNC de la empresa como emisor). Si la IA
    no pudo confirmarlo, el NCF queda en observación con la nota "No se
    pudo confirmar en la factura que la emitió esta empresa".
  - "Consumidor final" **solo** con comprobante de consumo (B02/E32;
    `nombreClienteVenta`, grupo aparte en la pestaña Clientes). Sin nombre
    ni RNC y con otro comprobante: "Cliente sin identificar", observación
    en el RNC del cliente (no entra en la aprobación en bloque:
    `faltaClienteEnVenta`) y aviso en `validarVentaIngresos` ("Solo una
    factura de consumo (B02 o E32) puede ir sin cliente"). Es aviso, no
    error: la identificación del cliente sigue siendo opcional en el
    reporte de ingresos (decisión del 2026-11-15).
- **CSV**: UTF-8 con BOM, separado por comas, CRLF, RNC/NCF como `="…"`
  para que Excel no quite ceros (**confirmado por el usuario el
  2026-11-19**); exporta las seleccionadas.
- Hecho por un agente en paralelo y revisado: 74/74 comprobaciones en
  navegador (menú y activo en `/lote`, cada módulo solo su tipo, otra
  empresa nunca aparece, barra de estados, búsqueda, orden, paginación
  1–25 / 26–47, aprobar en grupo solo las aprobables, CSV leído de vuelta,
  eliminar 2 con confirmación, proveedores, "Una factura" con el tipo
  correcto, lote con una venta dentro de Costos y gastos, redirecciones,
  móvil sin desbordar). No probado contra la DGII real el botón
  "Verificar en la DGII" de los módulos (misma lógica de antes).

### Dashboard en tarjetas (pedido por el usuario el 2026-11-18, construido el 2026-11-19)

> "No me gustó ese calendario tan grande en el dashboard, mira la diferencia
> con el de Cielo Nómina, se ve mucho más profesional con gráficos y todo."

- Inspirado en el Dashboard de Cielo Nómina (captura del usuario): fila de
  encabezado "Resumen fiscal" con un solo bloque de filtros (período,
  rango **3M / 6M / 12M** para los gráficos de evolución y botón "Tabla"
  para ver cada valor sin tooltip), y cuadrícula de tarjetas (3 columnas en
  computadora, 2 en tableta, 1 en móvil; alturas parejas por fila):
  - **Costos y gastos**: compras del período, variación, columnas por mes.
  - **Composición de compras**: dona Costo / Gasto / Activo / Sin
    clasificar con leyenda de montos y % (la guía de visualización prefiere
    una barra segmentada; se usó dona porque el usuario pidió ese estilo, y
    la leyenda deja cada valor a la vista).
  - **Ingresos**: línea con área, punto final y línea vertical que sigue al
    cursor.
  - **ITBIS del período**: diferencia orientativa ("No es la IT-1"),
    barras de ITBIS en ventas y en compras, y columnas por mes.
  - **Agenda fiscal** (`src/components/dashboard/AgendaFiscal.tsx`):
    calendario compacto con un punto por urgencia bajo los días 10, 15 y
    20, hoy en círculo, y la lista IR-17 / 606 / IT-1 con "Faltan N días" /
    "Venció hace N días" y aviso de fin de semana. Reemplaza al calendario
    grande, que se borró.
  - **Principales proveedores** (iniciales, RNC, monto, "Ver todos →" a
    Costos y gastos), **Listo para el 606** y **Requieren tu atención**
    (cada fila va a Ingresos o a Costos y gastos según su tipo).
- Hecho por un agente en paralelo y revisado: 37/37 comprobaciones en
  navegador (cifras contra un cálculo aparte, 3M/6M/12M, tooltips con
  cursor y teclado, agenda, enlaces, filas parejas a 1440 y 1024 px,
  empresa vacía, iPhone 13 sin desbordar). `dashboard.ts` suma
  `arcosDona`, `mesesConFacturas`, `montoRDCompacto`, `cuentaRegresiva`,
  `urgenciaDe` y el ITBIS por mes en `serieMensual` (20 pruebas).

### Calendario fiscal en el Dashboard (2026-11-18) — reemplazado por la Agenda fiscal compacta

> "En el dashboard agrega un calendario fiscal que resalte las obligaciones
> fiscales por días, acorde al mes."

- `src/components/dashboard/CalendarioFiscal.tsx`; cálculos en
  `src/lib/dashboard.ts` (`obligacionesDelMes`, `semanasDelMes`, con
  pruebas). Va arriba del Dashboard y **reemplaza la franja "Próximos
  vencimientos"** (no se repite: la agenda del calendario trae lo mismo).
- Mes en curso por defecto, flechas para otros meses y "Hoy" para volver.
  Cuadrícula de lunes a domingo; hoy en un círculo azul; los días con una
  obligación resaltados con su etiqueta (IR-17, 606, IT-1). Color por
  urgencia, siempre con el texto: azul si falta más de 3 días, rojo claro
  a 3 días o menos, rojo lleno el mismo día, gris si ya pasó.
- Agenda a la derecha (debajo en móvil): cada obligación con su fecha,
  período ("Período octubre de 2026") y "Faltan N días" / "Vence hoy" /
  "Venció hace N días". Como no existe "marcar como declarado", una fecha
  pasada dice "Venció", nunca "Cumplida".
- **Solo las obligaciones con fuente verificada**: IR-17 (día 10), 606
  (día 15) e IT-1 (día 20) del período anterior. IR-3, anticipos de ISR,
  TSS y las declaraciones anuales **no** están: se agregan cuando el
  usuario entregue sus fuentes (lección 2).
- Fechas nominales, sin correr por fin de semana ni feriado (⚠️ SIN
  VERIFICAR la regla de prórroga). Si una cae sábado o domingo, la agenda
  avisa: "Cae domingo: confirma si se corre al siguiente día laborable"
  (pasa con el 606 de octubre 2026, el domingo 15 de noviembre).
- Comprobado en navegador: 19/19 del Dashboard (nuevas: calendario de
  noviembre con 3 obligaciones; días 10, 15 y 20 resaltan IR-17, 606 e
  IT-1; "Faltan 2 días" para el IT-1; mes siguiente muestra diciembre con
  el período noviembre; "Hoy" vuelve; la empresa sale una sola vez y no
  hay franja "Trabajando en") y 27/27, 16/16, 9/9, 15/15 y 26/26 de los
  demás. Capturas en claro, oscuro y móvil, sin desplazamiento horizontal.

### Cada opción una sola vez (pedido por el usuario el 2026-11-18) — MANDA

> "Hay opciones que se repiten en distintos lugares demasiado, subir lote se
> repite demasiadas veces."

Decidido con las opciones recomendadas:

- **Regla**: la navegación vive en el menú (lateral en computadora, barra
  inferior en móvil). Un botón dentro de una pantalla solo aparece si es el
  siguiente paso de esa pantalla (por ejemplo, "Subir el primer lote" en el
  tablero de una empresa sin facturas, o "Revisar las pendientes" en
  "Listo para el 606"). No volver a poner accesos que repitan el menú.
- **Menú de una empresa: Dashboard, Facturas y Reportes** (desde el
  2026-11-19: Dashboard, Ingresos, Costos y gastos, Reportes; "Agregar
  facturas" está en cada uno). "Subir lote" ya no es un módulo: es parte de
  Facturas. En Facturas hay un solo botón,
  **"Agregar facturas"**, con dos opciones: "Una factura" (foto o PDF de una
  factura, o a mano) y "Un lote" (PDF con muchas facturas o varias fotos),
  que lleva a `/empresa/<id>/lote`. Ahí "Facturas" queda marcada en el menú
  (`NavItem.activoEn`).
- Se quitaron: "Subir lote" del menú y de la barra móvil; los botones Subir
  lote / Facturas / Reportes del encabezado del Tablero; el botón "Subir
  lote" junto a "Nueva factura" (los dos se volvieron "Agregar facturas");
  el botón del estado vacío de Facturas (el texto remite a "Agregar
  facturas"); "Cambiar" de la barra móvil. (Después, al quitar la franja
  "Trabajando en", "Cambiar de empresa" volvió al menú lateral: es el único
  lugar en computadora.)
- Comprobado en navegador real: 14/14 del tablero (dos nuevas: el tablero no
  repite el menú; el menú lateral es exactamente Tablero, Facturas,
  Reportes), 27/27 de la separación por empresa (nuevas: Subir lote desde
  "Agregar facturas", Facturas marcada en el menú, un solo "Cambiar de
  empresa"; en móvil la barra trae Tablero, Facturas y Reportes y "Cambiar"
  aparece una vez), y 16/16, 9/9, 15/15 y 26/26 adaptadas a "Agregar
  facturas". Sin desplazamiento horizontal en móvil.
- **La empresa tampoco se repite**: su nombre y RNC salen solo en el
  bloque "Empresa activa" del menú (en móvil, en la línea de arriba), y en
  ninguna otra parte del Dashboard. Con el renombre a "Dashboard":
  15/15, 27/27, 16/16, 9/9, 15/15 y 26/26.

## Padrón de RNC en el sistema (pedido por el usuario el 2026-11-25) — construido

> "Que el usuario escriba el número de RNC y esos campos de razón social y
> actividad económica se completen automáticamente." "No quiero que cada
> quien tenga que subir el padrón, quiero que este padrón duerma en la base
> de datos del sistema, es decir directamente en el repositorio." Sobre que
> el repo es público: "no hay riesgo, de por sí este es un archivo público".

- **Por qué un archivo y no una consulta en línea**: dgii.gov.do (Azure
  Front Door) responde **403 "Acceso denegado"** a las conexiones desde
  servidores. Pasó con todas sus páginas, incluida la de inicio y la
  descarga del padrón, probado el 2026-11-25. Es un bloqueo de la DGII: no
  se intenta saltarlo. El usuario descarga el `DGII_RNC.zip` desde su
  navegador y se procesa con un script.
- **Formato del archivo de la DGII**:
  - Revisado con el de noviembre de 2026 (fecha dentro del zip: 21-11-2026).
  - 799,886 líneas en Latin-1 (la É es un byte), CRLF.
  - 11 columnas separadas por `|`: RNC o cédula, razón social, nombre
    comercial, actividad económica, 4 vacías, fecha, estado, régimen.
  - **La DGII corta la actividad a 30 caracteres.**
  - Estados: ACTIVO, SUSPENDIDO, DADO DE BAJA, CESE TEMPORAL, ANULADO,
    RECHAZADO. Régimen: NORMAL o RST.
  - ~20 registros traen un salto de línea dentro del nombre (se unen) y uno
    tiene un RNC de 8 dígitos (se descarta).
- **`scripts/padron-rnc.mjs`** (`npm run padron-rnc -- ruta/DGII_RNC.zip`):
  - Lee el zip o el TXT y escribe `public/padron-rnc/`.
  - `indice.json`: fecha del padrón, total, catálogo de 1,922 actividades y
    prefijos.
  - 805 pedazos `<prefijo>.tsv.gz`, partidos por prefijo del RNC hasta que
    ninguno pase de 100 KB: 15.4 MB en total, el mayor de 97 KB.
  - 799,857 registros.
  - **Para actualizar el padrón**: correr el script con el archivo nuevo y
    publicar.
- **`src/lib/padron-rnc.ts`**: al escribir 9 u 11 dígitos busca el pedazo
  del prefijo más largo y lo descomprime en el navegador
  (`DecompressionStream`; si el servidor ya lo entregó descomprimido, lo lee
  tal cual). Cada búsqueda baja el índice, una sola vez, y un pedazo.
- **Formulario de empresa (`ClienteModal`)**:
  - Llena razón social, nombre comercial y actividad, y elige persona
    jurídica (9 dígitos) o física (11).
  - Solo llena campos vacíos o los que llenó antes el padrón: lo escrito a
    mano no se pisa.
  - Al editar una empresa no toca nada mientras el RNC siga igual.
  - Muestra el estado: "Activo en la DGII" en verde; suspendido o cese
    temporal en ámbar ("confírmalo con el cliente"); dado de baja, anulado o
    rechazado en rojo ("revisa que el número sea el correcto"); "(RST)" si
    es régimen simplificado; y la fecha del padrón.
  - Si no está: "Este número no está en el padrón … completa los datos a
    mano".
  - Nada bloquea el guardado.
- **Comprobado**:
  - `npm test` 267/267. Las 7 nuevas recorren los 805 pedazos reales: cada
    registro en su pedazo, suman el total, ningún pedazo de más de 100 KB y
    los prefijos no se pisan.
  - Navegador 9/9 contra `next start`, con RNC y cédulas tomados del padrón
    real:
    - se llenan los tres campos;
    - fecha del padrón;
    - solo baja el índice y un pedazo;
    - lo escrito a mano se conserva;
    - aviso rojo en un RNC dado de baja;
    - una cédula elige persona física;
    - un RNC inexistente avisa;
    - se guarda con la actividad del padrón.

## Verificación en la DGII (pedida por el usuario el 2026-11-18) — construida

> "Es necesario que el sistema verifique automáticamente el estatus de las
> facturas para evitar tener en el reporte facturas rechazadas."

- El código QR de un e-CF es la dirección de la consulta de la DGII. La
  ruta `POST /api/verificar-dgii` la consulta desde el servidor (solo
  direcciones `ecf.dgii.gov.do` / `fc.dgii.gov.do` de la consulta de
  timbres; código de acceso obligatorio; sin redirecciones) y
  `src/lib/verificacion-dgii.ts` interpreta la respuesta.
- Dónde corre: paso 2 de 3 de la captura por lotes (gratis, antes de la
  IA); al subir una factura suelta (se busca el QR en el archivo); y en
  Facturas con "Verificar en la DGII" (vuelve a consultar todas las de la
  lista que tienen QR).
- Reglas: rechazada o "no encontrada" = error (no se aprueba en bloque, no
  se marca revisada, el 606 no se descarga). NCF de la factura distinto del
  e-NCF del QR = error.
- **Factura electrónica sin verificar** (QR borroso o ilegible, consulta
  fallida) **o en proceso / estado desconocido = verificación humana**
  (decisión del usuario, 2026-11-18: "si una factura electrónica tiene el QR
  borroso que pase lo mismo, si la info está borrosa se pone la alerta para
  que esa en particular sea verificada humanamente"). Se trata como un dato
  borroso: el NCF queda en observación (`requiereVerificacionHumana`), en
  ámbar en el formulario, con la marca "Verificar en la DGII" en Facturas, y
  no entra en la aprobación en bloque. No es un error: una persona la
  verifica en la DGII y la marca revisada. Si después se verifica y sale
  aceptada, la observación del NCF se quita sola.
- **Serie B: no tiene QR** (lo señaló el usuario y lo reiteró el 2026-11-25: "el QR solo existe para series E"; una prueba en `lectura-escalonada.test.ts` lo fija: una B sin QR no tiene relectura, observación del NCF ni verificación humana, y se aprueba en bloque). El lector de QR pasa por todas las páginas porque antes de leer no se sabe la serie, pero en una B no encontrarlo no produce nada. Así que no hay nada que
  verificar desde el sistema y pasa sin esa alerta. **Lo de la DGII manda** como lo
  del QR: su ITBIS reemplaza el de la IA y su razón social llena el nombre.
  En una factura suelta también mandan los datos del QR (RNC, e-NCF, fecha,
  total), igual que en los lotes.
- `DocumentoFiscal.qrUrl` y `DocumentoFiscal.verificacionDGII` guardan la
  dirección y la última respuesta.
- **Medido el 2026-11-18 contra la DGII real** (ver
  `docs/dgii/marco-legal.md`): responde sin desafío; con el QR completo da la
  tabla con "Estado: Aceptado" (3 facturas reales, y otras 4 en el
  recorrido de navegador); sin código de seguridad, sin fecha de firma o con
  el monto alterado responde "No fue encontrada".
- **Límites**: no se ha comprobado que la
  DGII responda a los servidores de Vercel (en producción hace falta además
  `OCR_CODIGO_ACCESO` configurado; la API key de Anthropic no). Los estados
  distintos de "Aceptado" salen de la NG 01-2020, no se han visto en una
  respuesta real.

## Captura por lotes (construida el 2026-11-15, IA automática el 2026-11-17)

Flujo: Facturas → "Subir lote" → se elige el cliente y se sube un PDF de
hasta 100 páginas o varias fotos → **paso 1** (navegador, gratis): separar
páginas y leer el código QR → **paso 2** (servidor, gratis, desde el
2026-11-18): estado de cada e-CF en la DGII → **paso 3** (servidor, con costo): la IA lee
cada página, 3 a la vez, con barra de progreso y botón "Detener" → cada
página queda como tarjeta con "Lista" o "Revisar: …" → "Guardar N
factura(s)" → "Aprobar las N sin observaciones".

- `src/lib/lote/leer-paginas.ts`: dibuja cada página con pdf.js a 200 ppp
  y busca el QR con ZXing (WebAssembly).
- `src/lib/lote/borrador.ts` (lógica pura, probada): qué factura sale de
  cada página (`interpretarPagina`), cómo se combina el QR con la lectura
  de la IA (`fusionarConLectura`) y qué queda para revisar
  (`observaciones`).
- **Regla de combinación: lo del QR manda** (RNC, e-NCF, fecha y total los
  firmó el emisor); la IA aporta todo lo demás. Si los montos de la IA no
  suman el total del QR, quedan marcados. Si la IA entendió la factura al
  revés (compra por venta), se descarta su lectura y queda solo el QR.
- **Recibos largos** (tiras de ~620 × 4,400 px): `src/lib/lote/tramos.ts`
  los parte en tramos solapados (máx. 8) que viajan juntos en la misma
  solicitud; el prompt le dice al modelo que son partes de un mismo
  documento. En el PDF real, 42 páginas salieron partidas (máx. 6 tramos).
- Páginas que la IA no reconoce como factura → "No es factura",
  desmarcadas (se pueden marcar a mano).
- Duplicados: contra lo guardado y dentro del lote, con el NCF del QR o el
  que leyó la IA. Factura de otro contribuyente (por QR): no se deja
  guardar.
- Si falta el código de acceso o el servidor responde 503, la lectura con
  IA se detiene enseguida (no sigue intentando con cada página) y las
  páginas quedan con lo del QR. Una página que falla por otro motivo queda
  marcada y se reintenta con "Leer con IA las N que faltan" (solo esas).
- En el formulario de una factura con imagen guardada sigue el botón
  "Leer con IA lo que falta" (llena solo campos vacíos).
- El worker de pdf.js y el `.wasm` del lector de QR se sirven desde el
  propio sitio: `scripts/copiar-estaticos.mjs` los copia a `public/` en
  `postinstall`, `predev` y `prebuild` (no se versionan).

**Medido con el PDF real de 58 páginas:**
- Paso 1 (QR, real): 27 códigos leídos, todos compras del cliente
  correcto, 17.5 s. Comparación de lectores: ZXing imagen entera 19; ZXing
  con ventanas ampliadas ×2, 27 en el navegador; jsQR 20 en 110 s; OpenCV
  23.
- Paso 2 con la IA **simulada** (no hay API key): las 58 páginas pasaron
  por la ruta, 3 a la vez, con el RNC y la actividad del cliente; todo el
  lote tardó ~22 s con respuestas de 150 ms (con la IA real tardará más:
  sin medir). Guardar ocupó 67 KB en `localStorage` más 58 imágenes en
  IndexedDB.

**Pendiente de la captura:**
- **Medir con la IA real** (requiere API key): precisión campo por campo,
  tiempo por página y costo por página. En particular, si los tramos de
  los recibos se leen bien.
- Foto con varias facturas, y fotos HEIC de iPhone: sin tratar.
- No se puede retomar un lote si se cierra la pestaña a mitad del paso 2
  (lo leído hasta ahí se pierde si no se guardó).

## Costo y límites (aprobado por el usuario el 2026-11-15) — construido en parte

Contexto: es un producto de venta; el costo de IA no puede crecer sin
control y tiene que dejar margen.

**Decidido:**

1. **Tope de 100 páginas por PDF en el MVP.** Es un tope por tiempo y
   confiabilidad (el navegador procesa con la pestaña abierta), NO un
   control de costo: 500 facturas cuestan lo mismo en un PDF que en cinco.
   El número es un estimado a ajustar cuando se mida.
2. **El control real del costo es un cupo mensual de facturas por plan**
   (se cobra por volumen, y el sistema avisa antes de procesar cuántas
   páginas trae el PDF y cuántas quedan en el mes). Requiere cuentas: hoy
   todos comparten un código de acceso y no se distingue quién gasta.
   **Consecuencia: para vender con planes, las cuentas (migración a
   Firebase, paso 8) tienen que adelantarse en el roadmap.** Para la prueba
   inicial con el usuario y uno o dos contadores de confianza alcanza con
   el código de acceso.
3. **Tope de gasto mensual en la consola de Anthropic** como red de
   seguridad (lo configura el usuario).
4. **No pagar dos veces por lo mismo**: detectar páginas repetidas antes de
   enviarlas, no volver a procesar páginas ya leídas al reintentar, saltar
   páginas en blanco.

**Estado:** construido el tope de 100 páginas (punto 1); las páginas
duplicadas por QR y las de otro contribuyente no se envían a la IA, y el
reintento solo relee las que fallaron (parte del punto 4). Las páginas en
blanco SÍ se envían (la IA las marca como "no es factura"), y una página
sin QR que resulte duplicada solo se detecta después de pagar su lectura.
Sin construir: cupo por plan (requiere cuentas), aviso de cuántas páginas
quedan en el mes, y la medición de modelos (requiere API key). El punto 3
lo tiene que configurar el usuario en la consola de Anthropic.
5. **Medir los modelos con facturas reales antes de fijar el modelo y los
   precios de los planes.**

**Estimados de costo por página — SIN MEDIR, solo orden de magnitud**
(calculados a mano con los precios de lista de noviembre 2026 y un supuesto
de ~4,500 tokens de entrada y ~1,500 de salida por página):

| Modelo | Por página | 300 facturas |
|---|---|---|
| `claude-opus-5-5` (el actual) | US$0.03–0.05 | US$9–15 |
| `claude-sonnet-5-5` | US$0.02–0.03 | US$5–8 |
| `claude-haiku-5-5` | US$0.001–0.002 | US$0.30–0.50 |

No usar estos números para fijar precios: reemplazarlos por los medidos.

**Primera medición real (2026-11-19, dicha por el usuario)**: con Opus 5.5
y `effort: medium`, unas 120 lecturas gastaron US$1.36 de un saldo de
US$5 (quedaron US$3.64). Son **~US$0.011 por lectura**, menos que el
estimado de arriba. Es aproximada: el número de lecturas es del usuario, y
una lectura puede llevar varios tramos de un recibo. Precisión aún sin
medir.

**Herramienta "Comparar modelos"** (pedida con la opción recomendada,
2026-11-19: "comparar antes de cambiar"): `/configuracion/comparar`. Lee
las mismas páginas (hasta 50; eran 20 hasta que el usuario pidió subirlo el mismo día) con dos modelos de `MODELOS_OCR`
(`src/lib/ocr-modelos.ts`: Opus 5.5, Sonnet 5.5, Haiku 5.5, con sus precios
de lista). Muestra por modelo el costo estimado (tokens de `uso` × precio),
el tiempo, las páginas con error y **cuántos datos del QR acertó** (NCF,
RNC de la contraparte, fecha y total; el QR lo firmó el emisor, es la
referencia exacta). Por página, los campos en que difieren, con ✗ en el que
no coincide con el QR. No guarda nada. La ruta acepta `modelo` (solo de la
lista; otro → 400) y devuelve `uso` (modelo que respondió y tokens). Haiku
5.5 va sin `fallbacks` (no tiene respaldo de servidor). La aplicación sigue
leyendo con `MODELO_OCR_POR_DEFECTO` (Opus 5.5) hasta que el usuario
decida. Comprobado en navegador con la IA simulada: 15/15 (4 llamadas para
2 páginas, costos US$0.080 vs US$0.0020, QR 4/4 vs 3/4, ✗ en el NCF
equivocado, coincidencia 85%, nada guardado, móvil sin desbordar, la ruta
real rechaza un modelo fuera de la lista). Regresión del lote: 15/15.

**Propuesta pendiente de medir (no decidida):** lectura escalonada — leer
cada página con el modelo barato y volver a leer con uno más fuerte solo
las que fallen validaciones automáticas (monto + ITBIS ≠ total, RNC de
longitud incorrecta, fecha fuera del período, campo requerido vacío). No
apoyarse en la confianza que reporta el propio modelo: no es confiable
para decidir esto. Se le dijo al usuario explícitamente que **no se sabe**
si Haiku lee bien fotos malas, papel térmico o manuscritas; eso es lo que
la medición tiene que responder, campo por campo (un dígito mal en un RNC
o NCF es un error fiscal, no un detalle).

## Lectura escalonada: Haiku → Sonnet → captura manual (decisión del usuario, 2026-11-21) — MANDA

> "Me voy con tus recomendaciones, habiendo de Haiku el modelo principal y
> si falla la relectura se hace con Sonnet; si Sonnet falla obligatoriamente
> el usuario tiene que digitalizar manual la factura, solo un intento con
> Sonnet, no se permite reintento de leer el mismo documento y se le pone una
> alerta de que no es permitido y es crucial que ese documento en específico
> sea validado por un humano."

**Por qué** (evaluación con 5 agentes expertos en paralelo, pedida por el
usuario: costos de Anthropic, proveedores alternativos, OCR sin IA,
arquitectura, fiscal/negocio; Claude arbitró):
- Opus calculado con la documentación de tokens de imagen (cada página
  ~4,700 tokens de imagen con el tope de los modelos 4.7 o posteriores,
  ~2,500 de instrucciones y el razonamiento) sale a **~US$0.05 por factura**,
  no US$0.011. El US$0.011 medido estaba subestimado: las lecturas con error
  400 no se cobran. Con Opus, 1,000 facturas costarían ~US$50 al mes: no hay
  negocio. Es una cifra calculada; la real sale ahora del `uso` de cada
  lectura.
- Haiku 5.5 sale a **~US$0.0013–0.0015** por factura (unas 40 veces menos).
  Es el más barato junto con OpenAI gpt-6-luna, con el mismo proveedor y las
  mismas condiciones de privacidad. Gemini Flash-Lite cuesta unas 4 veces
  más; queda como plan B si Haiku falla la medición. Los lectores de
  facturas de AWS, Azure y Google se descartaron: cuestan igual o más y no
  razonan (no clasifican costo / gasto / activo). Tesseract se descartó
  (medido con recibos de prueba inventados: en papel desteñido con sello
  acertó 3 de 40 facturas completas).
- Un error que se escapa en el 606 cuesta ~US$40 (recargo de la Ley 30-26,
  intereses, corrección). Por eso hay red de seguridad: validaciones
  automáticas, relectura y persona.
- Costo estimado: 1,500 facturas al mes ≈ US$2–2.50 solo Haiku, y ~US$7.50
  si Sonnet relee el 25%. Sin medir todavía con facturas reales.

**Cómo funciona** (`src/lib/lectura-escalonada.ts`, lógica pura con 18
pruebas):
1. `MODELO_OCR_POR_DEFECTO` = Haiku 5.5 lee la factura.
2. `motivosRelectura` revisa su lectura:
   - lo que la IA leyó distinto al QR (NCF, RNC, fecha o total), o la
     factura entendida al revés;
   - montos que no suman el total (con el ITBIS de la DGII si lo hay);
   - errores del formato en los campos que llena la IA (obligatorio vacío,
     formato inválido);
   - el dígito verificador del RNC o la cédula.
   No cuenta lo exacto (QR, DGII) ni lo que una relectura no arregla. No se
   usa la confianza del modelo.
3. Si hay motivos: **una sola** relectura con `MODELO_OCR_RELECTURA` =
   Sonnet 5.5. Un error de servicio de Haiku también pasa a Sonnet.
4. Si Sonnet tampoco pasa, o falla: **captura manual**
   (`LecturaIA.manual`). Todo lo que llena la IA, salvo lo exacto del QR y
   la DGII, queda en ámbar.
   - En el lote: tarjeta "Requiere captura manual" con los motivos, y aviso
     arriba.
   - En el formulario: alerta roja "es crucial que una persona valide esta
     factura", y no se ofrece "Leer con IA lo que falta".
   - `esAprobable` la excluye siempre de la aprobación en bloque: se valida
     una por una.
5. **No se vuelve a leer el mismo documento**: `huellaArchivo` (SHA-256).
   - Para una foto es la del archivo original; para una página de PDF, la de
     la imagen de la página.
   - En el lote, una página con la huella de una factura guardada queda como
     duplicada sin llamar a la IA. Si esa factura era de captura manual, se
     avisa que no se permite volver a leerla.
   - En una factura suelta, un archivo con la huella de una de captura
     manual no se lee.
   - Límite: si la factura se borra, su huella se va con ella.
   - Límite: un PDF subido como factura suelta y luego en un lote tiene
     huellas distintas.
6. Errores de servicio (falta el código, la IA no está configurada) no
   cuentan como lectura fallida: la página queda sin leer y se puede
   reintentar.

**También**:
- Las instrucciones fijas van en `system` con `cache_control`. Lo que cambia
  por factura (actividad, tramos) va en el mensaje.
- `uso` trae los tokens de caché, y `costoUSD` los cobra a 0.1× (lectura) y
  1.25× (escritura).
- Las páginas se guardan y se envían sin los márgenes blancos
  (`src/lib/lote/recorte.ts`, con pruebas). El QR se sigue buscando en la
  página entera.
- "Comparar modelos" trae por defecto Haiku (principal) contra Sonnet
  (relectura).

**Comprobado** (IA y DGII simuladas):
- `npm test`: 260/260.
- Navegador, 18/18 del flujo nuevo:
  - una factura que pasa usa solo Haiku;
  - una que no cuadra se relee con Sonnet y queda "Lista";
  - una que falla dos veces queda de captura manual, sin tercer intento;
  - "Aprobar las 2" deja fuera la manual;
  - se guardan `lecturaIA` y la huella;
  - la manual abre con la alerta y sin "Leer con IA lo que falta";
  - volver a subirla, en el lote o suelta, no llama a la IA;
  - una suelta con RNC de dígito verificador malo termina en captura manual.
- Regresión: 15/15 comparar, 15/15 lote (una expectativa cambió a propósito:
  una lectura que no coincide con el QR dos veces termina en captura manual),
  75/75 módulos, 37/37 Dashboard.

**Pendiente**:
- Medir con facturas reales cuántas pasan con Haiku, cuántas relee Sonnet y
  cuántas quedan manuales; con eso, el costo real por factura.
- Verificar que la caché realmente se use: `tokensCacheLeidos` > 0 en
  lecturas seguidas.

## Relectura solo para partidas importantes, IA anónima y sin relectura manual (decisión del usuario, 2026-11-25) — MANDA

> "Solo vamos a usar Sonnet para partidas que realmente importan ... lectura
> con Haiku; si el sistema determina que una partida importante como los
> montos e ITBIS, RNC o NCF o e-CF no se ven, interviene Sonnet y listo; si
> Sonnet no puede ver bien y no está seguro, intervención humana
> obligatoria. El usuario no debe saber la IA que estamos usando ... no debe
> haber una elección humana de relectura ... los humanos tenemos ojos para
> ver y validar y esto está por encima de la IA porque un error en DGII
> puede salir caro." Y luego: "incluye la fecha también".

Reemplaza los criterios de relectura de la sección "Lectura escalonada".
- **Partidas importantes** (`CAMPOS_IMPORTANTES` en
  `src/lib/lectura-escalonada.ts`):
  - compra: RNC, NCF, fecha, monto en servicios, monto en bienes, ITBIS y
    total;
  - venta: RNC, NCF, fecha, monto facturado, ITBIS y total.
- **Motivos de relectura** (`motivosRelectura`):
  - lo leído distinto al QR (NCF, RNC, fecha, total) o la factura al revés;
  - montos que no suman;
  - errores del formato **en partidas importantes**;
  - total sin leer;
  - una partida importante que la IA marcó como dudosa ("no se ve con
    claridad");
  - el dígito verificador del RNC.
  - Lo exacto del QR o la DGII no cuenta.
  - **Nombre, tipo de bienes, forma de pago y demás no provocan relectura**:
    quedan en ámbar para la persona (o los resuelve la memoria del
    proveedor).
- **El usuario no ve qué IA se usa**:
  - el navegador solo conoce roles neutros (`principal`, `relectura`,
    `avanzado`) en `src/lib/ocr-modelos.ts`;
  - el modelo real de cada rol está solo en el servidor
    (`src/lib/ocr-modelos-servidor.ts`: Haiku 5.5, Sonnet 5.5, Opus 5.5);
  - la ruta responde `uso.modelo` con el rol y `lecturaIA.modelo` guarda el
    rol;
  - los mensajes de error ya no nombran al proveedor (el detalle queda en el
    registro del servidor);
  - se quitaron "Releída con …" y los nombres del aviso de captura manual;
  - "Comparar modelos" ya no está en Configuración: solo por su dirección,
    `/configuracion/comparar`, con nombres neutros.
  - Comprobado: el build del navegador (`.next/static`) no contiene
    "claude-haiku/sonnet/opus" ni "anthropic".
- **Sin relectura manual**: se quitaron "Leer con IA lo que falta" (formulario)
  y "Leer con IA las N que faltan" (lote). El sistema relee solo, una vez,
  durante el escaneo. Si el servicio no estaba disponible, se vuelve a subir
  el lote.
- Comprobado (IA simulada):
  - `npm test` 274/274: solo partidas importantes, la fecha incluida, y
    nada de lo que trae el QR.
  - Navegador:
    - 20/20 de la lectura escalonada (incluye que ni el lote ni el
      formulario mencionan qué IA se usa);
    - 7/7 memoria;
    - 16/16 comparar (incluye que Configuración ya no lo muestra);
    - 12/12 lote (sin el botón de releer);
    - 75/75 módulos;
    - 37/37 Dashboard;
    - 9/9 padrón.
  - Que un tipo de bienes dudoso no llame a Sonnet y un ITBIS dudoso sí está
    probado solo en las pruebas unitarias.

## Tipo de bienes y servicios: memoria por proveedor y pista del padrón (2026-11-25) — construido

El usuario vio muchas dudas de la IA en "Tipo de bienes y servicios" y
aprobó ("dale") las dos propuestas:
- **Memoria por proveedor** (`src/lib/memoria-proveedor.ts`, 6 pruebas):
  - Si las últimas facturas revisadas (hasta 5) de ese proveedor en esa
    empresa tienen todas la misma categoría, esa categoría se usa y deja
    de estar en duda.
  - Es por empresa porque lo mismo puede ser costo para un cliente y gasto
    para otro.
  - Si no coinciden, decide la IA.
  - No guarda nada aparte: sale de las facturas revisadas.
  - Se aplica a la lectura antes de evaluar la relectura: una categoría
    vacía que llena la memoria ya no paga una relectura con Sonnet.
  - En el formulario se avisa "la misma que le diste a las facturas
    revisadas de este proveedor".
- **Pista del padrón**: `actividadDelPadron` busca la actividad del
  proveedor y va en el campo `actividadProveedor` de `/api/ocr`, que la
  agrega al contexto de la lectura.
  - Con QR, ya en la primera lectura.
  - Sin QR, en la relectura con Sonnet, con el RNC que leyó Haiku
    (`leerEscalonado` pasa la lectura anterior).
  - Costo: unos 20 tokens.
- Comprobado con la IA simulada:
  - `npm test` 273/273.
  - Navegador 7/7:
    - un proveedor conocido con la categoría vacía queda "Lista" con 09,
      con una sola llamada (Haiku);
    - un proveedor nuevo va sin pista en la primera lectura y Sonnet recibe
      la actividad del padrón;
    - se guarda con la categoría recordada, y el formulario lo explica.
  - Regresión de la lectura escalonada: 18/18.

## Formatos 606 y 607 (fuentes recibidas del usuario el 2026-11-15)

El usuario entregó las dos herramientas de envío de la DGII (Excel con
macros) y sus dos instructivos. **La especificación completa extraída de
ellos está en `docs/dgii/formatos-606-607.md`** — leerla antes de tocar
`src/lib/dgii-formatos.ts`. Los binarios originales no están en el repo.

Lo esencial:

- La fuente que manda es **el código de la macro** de cada herramienta (es
  lo que escribe el TXT); el instructivo aclara el significado. De ahí
  salen el orden exacto de los 23 campos de cada formato, los catálogos,
  las expresiones regulares del NCF y el algoritmo del dígito verificador.
- Archivo: campos separados por `|`, encabezado `606|RNC|AAAAMM|cantidad`,
  líneas separadas por CRLF y sin salto final.
- **Vencen el día 15** del mes siguiente. Sin operaciones no hay archivo:
  se presenta en cero por la Oficina Virtual.
- **606**: tipo de bienes y servicios y forma de pago son obligatorios
  para la DGII y NO están impresos en la factura. El tipo de bienes lo
  elige la IA (ver "Decisiones del usuario"); la forma de pago la lee si
  está impresa y, si no, Reportes pide una por defecto. Retenciones y
  tratamiento del ITBIS los digita la persona.
- **607**: EN DESUSO según el usuario (ver "Decisiones del usuario"). La
  especificación y el generador se conservan, pero la aplicación ya no
  genera ese archivo.
- El dígito verificador está en las macros pero **desactivado**; aquí se
  usa solo como aviso, nunca bloquea.

**Dudas abiertas (decírselas al usuario; no resolverlas de memoria):**

1. ~~La herramienta 607 entregada rechaza los e-NCF~~ — ya no aplica: el
   usuario indicó que el 607 fue descontinuado y las ventas se llevan como
   reporte de ingresos interno (ver "Decisiones del usuario").
2. **Segunda remisión por retenciones** (606): el instructivo dice que un
   NCF se vuelve a enviar cuando se paga en otro mes para reportar las
   retenciones. No está modelado: cada factura pertenece solo al mes de su
   fecha de comprobante.
3. El archivo generado **no se ha pasado por la Herramienta de
   Pre-validación de la DGII** (es una aplicación de Windows). Solo se
   verificó contra la lógica de la macro. Lo tiene que probar el usuario.
4. ~~Qué significa cada tipo de e-CF~~: resuelto el 2026-11-18 con la Guía
   de NCF (ver "Fuentes normativas").
5. **Snapshot al declarar (lección 3) todavía no existe**: el archivo se
   genera al vuelo desde las facturas y no se guarda. Antes de dar por
   terminado el 606/607 hay que agregar "marcar como declarado" con el
   contenido exacto enviado, y bloquear la edición de esas facturas.

## Decisiones del usuario sobre el 606/607 (2026-11-15)

Dichas por el usuario después de ver el formato funcionando. Mandan sobre
lo que diga la macro de la DGII en cuanto a qué se le exige a la persona:

1. **El sistema elige el "tipo de bienes y servicios" del 606** según lo
   que describe la factura. Implementado: el OCR devuelve la categoría
   (01-11) y la marca como dudosa si no está seguro; la persona puede
   cambiarla. Limitación conocida: la categoría correcta a veces depende
   del negocio del cliente (mercancía para revender = 09, la misma compra
   para uso propio = otra), y la factura no lo dice. Idea no decidida:
   recordar la categoría por proveedor a partir de lo que corrija el
   contador.
2. **Las retenciones se digitan a mano y solo si el usuario quiere**, en el
   606 y en el 607. El OCR no las intenta.
3. **No son obligatorios: fecha de pago, retenciones, tipo de retención ni
   forma de pago.** Una factura se puede marcar como revisada sin ellos.
   - La herramienta de la DGII SÍ exige forma de pago en cada línea del
     606. Para conciliar ambas cosas, la pantalla de Reportes pide una
     **forma de pago por defecto** para las compras que no la traen (las
     que sí la traen conservan la suya). Sin elegirla no se descarga el TXT.
   - Se mantiene la regla de la DGII de que, **si** se digita una retención,
     hay que poner la fecha de pago (o de retención, en el 607).
4. **El Formato 607 fue descontinuado** (dicho por el usuario; NO verificado
   contra la DGII). Las ventas se llevan como un **reporte de ingresos**
   para control interno y como base de otros reportes. Consecuencias ya
   implementadas:
   - Una venta se valida con `validarVentaIngresos`: solo exige NCF, fecha,
     monto facturado e ITBIS. Identificación del cliente, tipo de ingreso,
     retenciones y **formas de cobro son opcionales** ("se pone manual, no
     será obligatorio para nosotros"). Se admiten e-NCF.
   - Reportes ofrece "Ingresos" solo en Excel (sin TXT), con TODAS las
     ventas del mes en una hoja; ya no separa las facturas de consumo.
   - `validarVenta607`, `linea607`, `separarVentas607` y `generar607`
     siguen en `dgii-formatos.ts`, probados pero sin uso, por si algún
     contribuyente aún tiene que presentar el 607.
5. **En el 606 el sistema clasifica cada compra como gasto, costo o activo
   "acorde a las NIIF para PYMES".** Implementado así:
   - La clasificación ES el tipo de bienes y servicios del 606: 09 = costo,
     10 = activo, los demás = gasto (`clasificacionContable`). No hay un
     campo aparte: se muestra en el formulario y como columna de referencia
     en el Excel del 606.
   - El prompt del OCR le explica al modelo cómo distinguir inventario
     (costo), bienes de uso duradero (activo) y gastos. **Verificado contra
     el texto de la norma** (NIIF para las PYMES, tercera edición, febrero
     2025; el usuario dio el enlace el 2026-11-15 y se leyeron las Secciones
     13, 17 y 18). Párrafos en que se apoya `clasificacion606`
     (`src/app/api/ocr/route.ts`): 13.1 definición de inventario; 13.6
     transporte y aranceles de la mercancía son costo; 13.13 almacenamiento,
     administración y costos de venta son gasto; 17.2 definición de
     propiedades, planta y equipo; 17.5 repuestos; 17.10 entrega e
     instalación forman parte del activo; 17.11 y 18.15 publicidad,
     capacitación y gastos de apertura son gasto; 17.15 mantenimiento
     diario es gasto; 18.2 y 18.4 activos intangibles. El texto del prompt
     está parafraseado: la norma tiene derechos de autor y no está en el
     repo.
   - Para decidir bien hace falta saber a qué se dedica el cliente (lo que
     uno revende es costo; lo mismo para uso propio es gasto). Por eso
     `ClienteFiscal` tiene ahora `actividad` (texto libre, opcional), que se
     envía al OCR. Sin ese dato el modelo decide solo con la factura.
   - **El precio NO decide si algo es activo** (decisión del usuario,
     2026-11-18: "el precio de un artículo no le da en sí el título de
     activo, se determina por la actividad del comercio y por lo
     establecido en la sección de propiedad, planta y equipo"). Coincide
     con la norma, que no fija ningún importe (17.4 pide beneficios futuros
     probables y costo medible). Por eso **no hay umbral de monto** ni debe
     agregarse uno, y el criterio de `clasificacion606` no menciona precios
     ni montos: decide con la actividad del cliente y la Sección 17.
   - Sin probar con facturas reales (no hay API key).

**Duda resuelta el 2026-11-18** con la Guía Informativa de NCF: la nota de
crédito electrónica es la E34 (y la de débito la E33). Desde ese día una
E34 resta en los totales del 606 y del reporte de ingresos, igual que una
B04. Antes sumaba.

## Primera muestra real (PDF de un cliente, recibido el 2026-11-15)

El usuario envió el PDF escaneado de las compras de un mes de un cliente
real. **El archivo NO está en el repo ni debe estarlo: son datos de
terceros y este repositorio es público.** Tampoco se escriben aquí nombres
ni RNC. Lo que se aprendió de su estructura (medido, no supuesto):

- 58 páginas, 12.3 MB, escáner de oficina a 200 ppp, **una factura por
  página**, con capa de texto de OCR del propio escáner (de mala calidad:
  no sirve como fuente).
- **Las primeras 5 páginas no son facturas**: es la declaración IT-1 del
  período. El sistema tiene que reconocer y saltar páginas así.
- **43 de las 58 páginas son tiras largas y angostas** (recibos de caja):
  unos 620 px de ancho por hasta 4,400 px de alto. Si se reducen por su
  lado mayor quedan ilegibles; hay que partirlas en tramos o enviarlas a
  resolución completa. `reducirImagen` (lado mayor 2200 px) NO sirve para
  este caso. **Resuelto con tramos** (`src/lib/lote/tramos.ts`).
- Todas las facturas vistas son **comprobantes electrónicos (e-NCF, serie
  E31)**. Esto hace real la duda del 607: si las ventas del cliente también
  son e-CF, la herramienta 607 versión 2023.1.1 no las admite.
- Se ven facturas con **ITBIS al 18% y al 16%** en la misma muestra.
- Muchas páginas tienen marcas a mano y sellos encima del texto.
- **Los e-CF traen un código QR que se puede leer.** Contiene una URL de
  `ecf.dgii.gov.do/.../ConsultaTimbre` con `RncEmisor`, `RncComprador`,
  `ENCF`, `FechaEmision` (DD-MM-AAAA), `MontoTotal`, `FechaFirma` y
  `CodigoSeguridad`. Verificado decodificando páginas reales. Ojo: el
  nombre del parámetro del emisor varía (`RncEmisor`, `RNCEmisor`,
  `rncemisor`) y `MontoTotal` a veces trae coma de miles.
  - Un lector básico (OpenCV) leyó el QR en **23 de las 58 páginas**; el
    resto no tiene QR, lo tiene tapado por un sello o el lector no pudo.
    Sirve como verificación y para llenar datos exactos, no como reemplazo
    del OCR (no trae subtotal, ITBIS ni descripción).
  - `RncComprador` permite comprobar que la factura es de ese cliente, y
    comparar emisor/comprador con el RNC del cliente dice si es compra o
    venta sin preguntarle a nadie.

De aquí salió el diseño de la captura por lotes: leer el QR en el
navegador antes de llamar a la IA, partir las tiras largas, y que la IA
descarte las páginas que no son facturas. El lector final (ZXing con
ventanas) lee 27 de las 58, no 23.

## Roadmap (MVP angosto primero)

1. ✅ **Clientes** (`ClienteFiscal`, CRUD) — 2026-11-15, sin auth (ver
   decisión de arquitectura del MVP).
2. ✅ **Facturas**: subida de imagen/PDF → IA → revisión → `DocumentoFiscal`;
   también captura a mano — 2026-11-15.
3. ✅ **Campos alineados con los formatos de la DGII**, **TXT del 606**,
   **reporte de ingresos** (ventas, interno) y **exportación a Excel** de
   ambos — 2026-11-15. Falta que el usuario pase un 606 por el
   pre-validador de la DGII.
4. ✅ **Captura por lotes** con lectura de QR (2026-11-15) e **IA
   automática** sobre todo el lote, con aprobación en bloque de las
   facturas sin observaciones (2026-11-17).
5. ⏭️ **Siguiente**:
   a. **Medir la IA real** con facturas reales (requiere que el usuario
      configure `ANTHROPIC_API_KEY` en Vercel): precisión campo por campo,
      tiempo y costo por página, y comparar modelos (`MODELO_OCR`) antes
      de fijar precios.
   b. Snapshot al declarar ("marcar como declarado", lección 3).
   c. Resolver las preguntas abiertas al usuario (sección propia, abajo).
6. Declaración ITBIS mensual (aritmética sobre 606 + ingresos).
7. IR-17 (adaptar el mismo concepto ya implementado en Nómina).
8. Proyección de ISR.
9. Migración a Firebase (cuentas, datos en la nube, archivos en Storage).
   Se adelanta si se quiere vender con planes y cupos (ver "Costo y
   límites").
10. Hub/landing compartido de la suite, si hay ya 2+ productos en venta.

Candidatos sin decidir (confirmar con el usuario antes de hacerlos):
respaldo/exportación de los datos del navegador; estado "descartada" en la
interfaz (el tipo ya lo contempla); recordar la categoría por proveedor a
partir de lo que corrija el contador.

## Preguntas abiertas al usuario (actualizadas el 2026-11-18)

Hacerlas cuando toque; no resolverlas de memoria (lecciones 2 y 6).

1. **¿Que la IA lea la fecha de vencimiento de la secuencia** impresa en
   los comprobantes B (NG 06-2018, art. 7) y avise si la factura es
   posterior? Requiere un campo nuevo. Sin decidir.
1b. **Confirmar que la DGII responde a los servidores de Vercel** (solo se
   probó desde el entorno de desarrollo; en producción la ruta ya está
   publicada y el código configurado). Lo prueba el usuario con una factura
   con QR. Resuelto el resto: la serie B no
   tiene QR y pasa; un e-CF sin QR legible lo verifica una persona.
2. **Excel exportable aunque el reporte esté incompleto** (decisión
   propia; el archivo lo advierte en el nombre y en el Resumen).
3. **Segunda remisión por retenciones en el 606** (NCF que se vuelve a
   enviar el mes en que se paga): no modelada.
4. **Pasar un TXT del 606 por la Herramienta de Pre-validación de la
   DGII** (aplicación de Windows): solo lo puede hacer el usuario.
5. **Plan de Vercel**: el proyecto está en el plan Hobby, que hasta donde
   se sabe es para uso no comercial. Confirmar antes de vender.

6. **Avisos que van a Cielo Cloud Nómina**: el recargo por mora y las
   retenciones del art. 309 cambiaron con la Ley 30-26; la escala de ISR de
   asalariados cambia en 2027. Decirle al usuario que Nómina también hay
   que actualizarla.

Resueltas el 2026-11-18: los avisos de comprobante (serie B, consumo) no
frenan la aprobación en bloque ("deja pasar al sistema los comprobantes
serie B"); la tasa de ITBIS es 18% (usuario); la Ley 30-26 se recibió en
Word y se leyó.
Resueltas antes, el mismo día: no hay monto mínimo para activo (decide la
actividad y la Sección 17); la aprobación en bloque queda aprobada; qué
e-CF son nota de crédito y de débito (Guía de NCF: E34 y E33).

## Fuentes normativas

El usuario va a ir entregando normas y leyes fiscales para estructurar el
sistema (acordado el 2026-11-18). Método, el mismo que se usó con la NIIF
y con los formatos de la DGII: leer el texto completo, citar en el código
el artículo o párrafo de donde sale cada regla, parafrasear (no copiar
textos con derechos de autor al repo), y marcar `⚠️ SIN VERIFICAR` lo que
no salga de una fuente entregada.

**Recibidas:**
- Herramientas de envío 606 (versión 2025) y 607 (versión 2023.1.1) e
  instructivos de la DGII (2026-11-15) → `docs/dgii/formatos-606-607.md`.
- NIIF para las PYMES, tercera edición, febrero 2025 (enlace del usuario,
  2026-11-15) → criterios de costo, activo y gasto.
- **Primer lote de leyes (2026-11-18)**, leído completo salvo donde se dice:
  - Guía Informativa de NCF (DGII, marzo 2026): tipos B y E, quién emite
    cada uno, consumo no sustenta ITBIS ni costos, pagos al exterior solo
    servicios → `docs/dgii/formatos-606-607.md`, "Tipos de comprobante".
  - Ley 32-23 de Facturación Electrónica (G.O. 11107, 17-05-2023).
  - Decreto 587-24, reglamento de la Ley 32-23 (escaneado; leído con OCR,
    con atención a los arts. 4-10, 17-19, 38-43 y 51-59).
  - Páginas de la DGII "Marco legal de comprobantes fiscales" y "Tipo y
    estructura de los e-CF" (leídas en la web).
  - Código Tributario, Ley 11-92, texto consolidado (octubre 2025): leídos
    los artículos de ITBIS (335-360), tasas de ISR (296-297) y deberes
    formales (50). No se leyó entero.
  - Ley 30-26: no se pudo descargar de la DGII; el usuario la envió en el
    segundo lote.

**Vigencia — lo que se detectó como NO vigente o superado** (2026-11-18):
- Código Tributario art. 341 (ITBIS 16%, Ley 288-04): superado por el art.
  345 (Ley 253-12). El propio texto consolidado conserva ambos.
- Art. 297 (ISR 28%): la parte capital está superada por su párrafo II
  (27% desde 2015). Arts. 296 y 345: tablas con años 2013-2016 ya
  cumplidos; rige la última columna.
- Series A/P/Q de 19 posiciones: eliminadas en 2018 (la macro del 606 las
  acepta solo para períodos viejos).
- Comprobantes serie B: el calendario de la Ley 32-23 (art. 37) venció
  para el último grupo hacia mayo de 2026, con prórroga máxima de 6 meses
  (Decreto 587-24, art. 8) → hacia noviembre de 2026. Desde entonces la
  DGII da por vencidos los B de quien no implementó (art. 55), y un B de un
  emisor electrónico solo sustenta costos y crédito si estaba en
  contingencia notificada (art. 42). Registro Único de Ingresos (B12)
  termina: pasa a factura de consumo electrónica (art. 38).
- Formato 607: el usuario lo da por descontinuado (sin fuente; ver
  "Decisiones del usuario").
- Por verificar: la Guía cita el Aviso 24-2019 y el marco legal lista el
  Decreto 254-06 y las NG 06-2018, 05-2019, 01-2020 y 06-2021, que pueden
  estar modificados por la Ley 32-23 y su reglamento. No se recibieron.

**Aplicado al código el 2026-11-18** (`src/lib/dgii-formatos.ts`, con la
cita en cada regla): tipo de un e-NCF = las 2 posiciones después de la E;
E34 resta como nota de crédito; E43 y E47 exigen el RNC del cliente como
13 y 17; avisos (no bloquean) de factura de consumo en compras, de pagos al
exterior con bienes y de NCF no electrónico desde el 17-05-2026
(`FIN_CALENDARIO_ECF`, día exacto ⚠️ sin verificar; **apagado el 2026-11-25** por pedido del usuario: "quita las alertas correspondientes a las facturas B1 hasta que se indique que definitivamente no se aceptarán". Se vuelve a encender con `AVISAR_SERIE_B_VENCIDA`); el reporte de ingresos
admite E44-E46 y rechaza E41/E43/E47; la IA y el QR toman como compra los
comprobantes que emite el propio comprador (11/41, 13/43, 17/47). En
`dgii-fiscal.ts`: IT-1 día 20, ISR jurídicas 27% y tasa reducida 16% pasan
a verificados.

- **Segundo lote (2026-11-18)** → `docs/dgii/marco-legal.md`:
  - **Ley 30-26** (Word escaneado, leído completo con ruido de OCR).
  - **Decreto 293-11**, Reglamento del ITBIS (escaneado; OCR propio, leídos
    los arts. 17-30 y su derogatoria).
  - Decreto de 2001 que modificaba el Reglamento 140-98: **derogado** por
    el art. 30 del Decreto 293-11.
  - **Norma General 06-2018** sobre comprobantes fiscales (leída entera).
    NO es la de remisión de informaciones, como se dijo antes por error:
    esa es la NG 06-2014.
  - El usuario confirmó: ITBIS 18%; la facturación electrónica ya es
    obligatoria, pero los comprobantes serie B se siguen dejando pasar.
- **Cuarto lote (2026-11-18)** → `docs/dgii/marco-legal.md`: NG 07-2018
  (remisión de informaciones, **vigente**; confirma el 606 que ya genera el
  sistema), NG 10-18 (umbral de RD$250,000 del consumo en el 607; coincide
  con el código), NG 05-2019 (comprobantes especiales), instructivo y
  formulario del IT-1 2020 (estructura para el paso 6; sus penalidades
  quedaron superadas por la Ley 30-26). Decisiones del usuario: verificar
  el estado en la DGII automáticamente (construido) y **no aceptar NCF de
  19 posiciones** (error en compras, ventas y NCF modificado). Aplicado de
  la NG 05-2019: comprobante de exportación en compras = error (lo sustenta
  la DUA, art. 10); comprobante de compras con ITBIS sin retener = aviso
  del 100% (art. 7).
- **Tercer lote (2026-11-18)** → `docs/dgii/marco-legal.md`: Decreto 254-06
  (reglamento de comprobantes, vigente), NG 06-2014 (remisión de
  informaciones: **sustituida** por la NG 07-2018 y la NG 10-18, según la
  NG 01-2020), NG 06-2021 (solo cambia un plazo de respuesta de la DGII),
  NG 01-2020 (facturación electrónica) y otra copia de la Guía de NCF.
  Aplicado: dos instrucciones a la IA (artículos exentos con "E";
  comprobante de compras 11/41 emitido por el comprador).

**Pedidas al usuario para lo que sigue** (sin recibir; el usuario dijo
que envía "lo otro" en otro lote):
- Aviso 24-2019 (tipos de e-CF).
- Ley 690-16 (tasas de ITBIS de 9% y 8% que aparecen en el IT-1) y, si
  existe, una versión del formulario IT-1 posterior a la de 2020.
- Avisos de la DGII con las listas de obligados a e-CF y sus prórrogas.
- Formulario e instructivo del IR-17 y la norma de retenciones vigente
  (de ISR y de ITBIS).
- Escala de ISR de personas físicas ajustada de 2026.
- Reglamento de aplicación del ISR, para la proyección de ISR.
- Número y fecha de la Gaceta Oficial de la Ley 30-26 (vigencia exacta).

## Despliegue

- **Sitio publicado**: https://cielo-fiscal.vercel.app/ (Vercel, equipo
  del usuario, plan Hobby, proyecto `Cielo-Fiscal`). Vercel publica solo
  cada vez que cambia `main`; las ramas no se publican.
- Comprobado el 2026-11-15: las cinco pantallas responden 200 y
  `/api/ocr` responde 503 "El OCR no está configurado en el servidor",
  porque **todavía no hay `ANTHROPIC_API_KEY`**. La lectura de QR y todo lo
  demás funciona sin ella.
- La verificación en la DGII solo necesita `OCR_CODIGO_ACCESO` en Vercel
  (no la API key); sin él responde 503 y las facturas quedan "sin verificar".
- **2026-11-18: el usuario configuró `OCR_CODIGO_ACCESO` en Vercel** ("puse
  ocr en vercel"). Más tarde ese día dijo que **ya compró saldo en la API de
  Anthropic** ("la api que ya compré saldo"); falta que agregue
  `ANTHROPIC_API_KEY` en Vercel y haga Redeploy. Hasta entonces la IA
  sigue sin funcionar en producción (503) y las facturas solo se llenan con
  lo del QR y lo de la DGII.
- **Comprobado en producción el 2026-11-18, tras fusionar el PR #4**: las
  seis pantallas responden 200; `POST /api/verificar-dgii` sin código
  responde **401** (o sea, `OCR_CODIGO_ACCESO` sí está configurado: sin él
  sería 503); `POST /api/ocr` responde 503 por falta de
  `ANTHROPIC_API_KEY`. **Falta comprobar que la DGII le responde a Vercel**:
  hace falta el código de acceso, que solo tiene el usuario. Prueba: en
  Configuración escribir el código, subir una factura electrónica con QR en
  "Nueva factura" y ver si dice "Aceptada en la DGII".
- **Comprobado en producción el 2026-11-18, tras fusionar el PR #6**: `/`
  muestra "Tus empresas"; `/empresa/<id>`, sus Facturas, Subir lote y
  Reportes, y `/configuracion` responden 200; `/facturas` y `/clientes`
  redirigen (307) a `/`.
- **Comprobado en producción el 2026-11-18, tras fusionar el PR #8**: Vercel
  publicó en ~1 minuto; `/`, `/empresa/<id>` y sus tres módulos y
  `/configuracion` responden 200 y `/facturas` redirige (307). Las 12
  comprobaciones del tablero (`e2e10.js`) pasaron también contra el sitio
  publicado, con datos inventados sembrados en el navegador de la prueba.
- **Comprobado en producción el 2026-11-18, tras fusionar el PR #10**:
  publicado en ~75 s; las pantallas responden 200 y las 15 comprobaciones
  del Dashboard (`e2e10.js`: menú Dashboard / Facturas / Reportes, sin
  botones repetidos, empresa solo en la franja y el menú, vencimientos,
  período, gráfico, tabla) pasaron contra el sitio publicado, con datos
  inventados en el navegador de la prueba.
- **Comprobado en producción el 2026-11-19, tras fusionar el PR #12**:
  publicado en ~60 s; `/`, `/empresa/<id>`, `/ingresos`, `/costos-gastos`,
  sus dos `/lote`, `/reportes` y `/configuracion` responden 200;
  `/empresa/<id>/facturas` → `costos-gastos`, `/empresa/<id>/lote` →
  `costos-gastos/lote` y `/facturas` → `/` (307). Contra el sitio
  publicado, con datos inventados en el navegador de la prueba: 37/37 del
  Dashboard y 74/74 de los módulos (estas simulan `/api/ocr` y
  `/api/verificar-dgii`).
- **Comprobado en producción el 2026-11-19, tras fusionar el PR #14**
  (módulos independientes y consumidor final): las pantallas responden 200
  y, contra el sitio publicado, pasan 75/75 de los módulos (incluido el
  descarte de una factura del otro tipo, en la factura suelta y en el
  lote) y 37/37 del Dashboard, con datos inventados en el navegador de la
  prueba y la IA y la DGII simuladas.
- Para activar la IA: en Vercel, Settings → Environment Variables, agregar
  `ANTHROPIC_API_KEY` (key propia del producto, nunca personal) y
  `OCR_CODIGO_ACCESO` (frase larga elegida por el usuario), ambas en
  Production; luego Redeploy. En la app, escribir esa frase en
  Configuración. Recomendado: tope de gasto mensual en la consola de
  Anthropic.
- La ruta declara `maxDuration = 120` y el despliegue en Hobby lo aceptó;
  no se ha comprobado cuánto tarda una lectura real.

## Cómo trabajar en este repo

- `npm install` (copia además a `public/` el worker de pdf.js y el `.wasm`
  del lector de QR, vía `scripts/copiar-estaticos.mjs`).
- `npm run dev` · `npm test` (vitest, zona horaria de RD) ·
  `npx tsc --noEmit` · `npm run build`.
- Para probar la ruta OCR en local hacen falta `ANTHROPIC_API_KEY` y
  `OCR_CODIGO_ACCESO` en `.env.local` (ver `.env.example`).
- Las pruebas de navegador (Playwright) que se usaron en las sesiones
  vivían en el scratchpad y **no están en el repo**. Si se agregan,
  conviene simular `/api/ocr` como se hizo ahí (sin gastar API).
- **Nunca subir al repo facturas ni datos de clientes reales**: es un
  repositorio público. El PDF de muestra del usuario no está aquí.
- Historial: PR #1 (MVP completo) y PR #2 (criterios NIIF verificados)
  fusionados el 2026-11-15; PR #3 (captura por lotes + IA automática) el
  2026-11-17; PR #4 (cuatro lotes de normas fiscales aplicados, Ley 30-26 en
  el motor fiscal, verificación automática en la DGII, serie A rechazada,
  verificación humana de e-CF sin QR legible) el 2026-11-18; PR #5
  (comprobación en producción, solo documentación) y PR #6 (separación por
  empresa con "Tus empresas" y diseño premium de esa pantalla y del
  resumen) el 2026-11-18; PR #7 (comprobación en producción del PR #6, solo
  documentación) el mismo día; PR #8 (tablero de la empresa y estilo
  premium en Facturas, Subir lote y Reportes) y PR #9 (su comprobación en
  producción) el 2026-11-18; PR #10 ("Cada opción una sola vez", sin
  repetir la empresa, "Tablero" pasa a "Dashboard") y PR #11 (su
  comprobación en producción) el mismo día; PR #12 (sin franja "Trabajando
  en", Dashboard en tarjetas con Agenda fiscal compacta, y "Facturas"
  dividido en Ingresos y Costos y gastos, hechos por dos agentes en
  paralelo, fusionados y revisados) y PR #13 (su comprobación en
  producción) el 2026-11-19; PR #14 (módulos independientes, cada uno
  solo su tipo, y regla de consumidor final) y PR #15 (su comprobación en
  producción) el mismo día.

## Nombre del producto

"Cielo Cloud Fiscal" es un nombre sugerido, no una decisión final — cambiar
el texto es trivial (branding, título, metadata) si el usuario prefiere
otro (ej. "Cielo Cloud Impuestos", "Cielo Cloud 606").

## Branch / repo de trabajo

- Repo: `manuel-erasmo-oss/Cielo-Fiscal`.
- Rama de producción: `main` (la publica Vercel).
- Rama de desarrollo de las sesiones de noviembre 2026:
  `claude/new-session-697xwv`; el trabajo llega a `main` por pull request.

## Estado real del repo (actualizado el 2026-11-18)

Este archivo se escribió en la sesión de Cielo Cloud Nómina describiendo un
scaffold que vivía solo en aquel sandbox; el código no vino con él. En la
sesión del 2026-11-15 se recreó el scaffold en este repo y, tras la
decisión de arquitectura del MVP, se construyeron los pasos 1 a 4 del
roadmap (el 4 se completó el 2026-11-17). El 2026-11-18 se aplicaron cuatro
lotes de normas fiscales (`docs/dgii/marco-legal.md`) y se construyó la
verificación automática en la DGII.

### Qué hay en el árbol

- **Pantallas** (`src/app`), desde el 2026-11-18 (ver "Separación por
  empresa"): `/` Tus empresas (lista, búsqueda, alta, edición, borrado en
  cascada, "Entrar"); dentro de una empresa: `/empresa/[id]` Dashboard,
  `/empresa/[id]/ingresos` y `/empresa/[id]/costos-gastos` (módulos estilo
  ERP; cada uno con `/lote`, la captura por lotes, que vive en
  `src/components/lote/CapturaLote.tsx`), `/empresa/[id]/reportes` (TXT
  del 606 y Excel; reporte de ingresos en Excel); `/configuracion` (código
  de acceso, global).
- **Servidor**: `src/app/api/ocr/route.ts` y `src/app/api/verificar-dgii/route.ts`.
- **Datos** (`src/lib/datos`): `empresa.ts` y `empresa-context.tsx`
  (separación por empresa), `repositorio.ts` (interfaz),
  `repositorio-local.ts` (`localStorage`, claves `cielo-fiscal:clientes:v1`
  y `cielo-fiscal:documentos:v1`; imágenes en IndexedDB, base
  `cielo-fiscal`, almacén `archivos`), `datos-context.tsx` (estado compartido).
- **Lógica pura** (`src/lib`): `dgii-formatos.ts` (catálogos, reglas y
  generadores del 606 y 607), `documentos.ts` (qué factura puede marcarse
  revisada y entrar a un reporte, duplicados, validación de cliente),
  `excel-reporte.ts` (arma las hojas del Excel del 606 y de ingresos),
  `qr-ecf.ts` (interpreta el QR de un comprobante electrónico),
  `verificacion-dgii.ts` y `verificacion-cliente.ts` (estado en la DGII),
  `ocr-interpretar.ts` (de la lectura del modelo a los campos: compra o
  venta, contraparte, dudas), `lote/leer-paginas.ts` (páginas y QR),
  `lote/borrador.ts` (combina QR + IA y calcula observaciones),
  `lote/tramos.ts` (parte los recibos largos),
  `dashboard.ts` (cálculos del Dashboard), `comprobantes.ts` (lógica de
  los módulos Ingresos y Costos y gastos), `modulos.ts` (nombre y ruta de
  cada módulo), `dgii-fiscal.ts` (motor fiscal), `utils.ts` (fechas locales, montos),
  `ocr-tipos.ts` (contrato servidor↔navegador), `ocr-cliente.ts` (prepara
  el archivo y llama a la ruta), `config-local.ts`.
- **Scripts**: `scripts/copiar-estaticos.mjs`.
- **Documentación**: `docs/dgii/formatos-606-607.md` (especificación del
  606 y 607 extraída de las fuentes de la DGII) y `docs/dgii/marco-legal.md`
  (leyes y normas recibidas, qué está vigente y qué se aplicó).
- **Interfaz** (`src/components`): `layout/` (Sidebar portado de Nómina sin
  selector de empresa ni logout, Header, BottomNav, Pagina), `ui/`
  (Toast, Badge, EmptyState, ThemeToggle y StatCard copiados de Nómina;
  Modal y ConfirmDialog nuevos; `Monograma` y `premium.tsx` del diseño
  premium), `dashboard/Graficos` y `dashboard/AgendaFiscal`,
  `comprobantes/ModuloComprobantes` y `piezas`, `lote/CapturaLote`,
  `clientes/ClienteModal`, `facturas/FacturaModal`.
- Copiados byte a byte de `manuel-erasmo-oss/tyui` (commit `1555027`):
  `src/app/globals.css`, `postcss.config.mjs`, `tsconfig.json`,
  `.gitignore`. `tailwind.config.ts` es igual salvo una línea añadida al
  `content` (`./src/lib/**`): sin ella el gradiente de `BTN_PRIMARY` no se
  generaba, porque aquí esas clases solo aparecen en `src/lib/utils.ts`.

### Reglas de negocio ya implementadas (y probadas)

- Una factura se guarda como **pendiente** (puede estar incompleta) o como
  **revisada**. Revisada exige que el formato de la DGII no le objete nada
  (`problemasDeRevision` → `validarCompra606` / `validarVenta607`).
  `esIncluibleEnReporte` es el único criterio para entrar a un reporte.
- Los problemas tienen nivel `error` (bloquea) o `aviso` (solo se muestra:
  dígito verificador que no cuadra, cobros que no suman el total).
- El OCR lee emisor y comprador por separado y, con el RNC del cliente,
  decide si es compra o venta; dice si la página no es un comprobante.
  Extrae lo impreso (RNC, nombre, NCF, fechas, montos, impuestos, forma de
  pago si aparece). En compras además reparte el subtotal entre servicios
  y bienes (dudoso si no está seguro o si no suma el subtotal) y elige el
  tipo de bienes y servicios. Retenciones, tipo de ingreso y formas de
  cobro los llena la persona. El paso de la lectura del modelo a los campos
  está en `src/lib/ocr-interpretar.ts` (lógica pura, probada).
- Los campos de los que el OCR dudó se marcan en ámbar hasta que una
  persona los toca. ITBIS en cero es un dato válido, pero hay que
  escribirlo: se exige un valor explícito (criterio propio, más estricto
  que la macro, que no valida ese campo).
- **Duplicado** = mismo cliente, mismo tipo, mismo NCF y misma contraparte.
  Se avisa y no se deja marcar como revisada dos veces.
- Si lo facturado más los impuestos no da el total impreso se muestra un
  aviso que NO bloquea.
- **Reportes**: no deja descargar si en ese mes hay facturas pendientes o
  revisadas con errores — un archivo incompleto es peor que ninguno.
- **Exportar a Excel** (requisito del usuario: "es vital"). Del 606: papel
  de trabajo, no lo que se envía a la DGII; hoja 1 = tabla limpia con las
  23 columnas del formato (mismos valores que el TXT; una prueba compara
  cada fila contra la línea del TXT) + nombre, total y clasificación
  contable como referencia; hoja "Resumen" con totales y estado. De
  ingresos: es el reporte en sí; hoja "Ingresos" con todas las ventas y
  hoja "Resumen".
  A diferencia del TXT, **sí se puede exportar con el reporte incompleto**
  (decisión propia, no confirmada con el usuario): en ese caso el nombre
  del archivo termina en `_INCOMPLETO` y el Resumen lo dice en rojo.
  RNC, NCF y fechas van como texto para que Excel no les quite los ceros.
- Los registros guardados con el modelo anterior (9 campos) se completan
  con `null` al leerlos (`normalizarDocumento`) y aparecen en Reportes como
  facturas con errores hasta que alguien las complete.
- Datos dañados en `localStorage` producen un aviso y **no se
  sobrescriben**.
- Fotos de más de 4 MB se reducen en el navegador (lado mayor 2200 px,
  JPEG) antes de subir; el tope de 4 MB existe por el límite de 4.5 MB del
  cuerpo de una función de Vercel (dato recordado, no re-verificado en la
  documentación de Vercel).

### Verificado el 2026-11-15 (resultado real)

- `npm audit`: 0 vulnerabilidades hasta el 2026-11-15, con un `override`
  en `package.json` que fuerza `postcss` ^8.5.33 dentro de Next 15.5.29
  (que fija 8.4.31, con avisos altos). Al quitar Firebase desapareció el
  otro override.
  **2026-11-17**: aparece GHSA-fc5q-39xc-vjpf (ReDoS en `picomatch`
  <=4.0.7, severidad alta). La versión más nueva publicada es la 4.0.7, así
  que no hay arreglo todavía. Solo lo usan herramientas de desarrollo
  (Tailwind al compilar, vitest/vite); `npm audit --omit=dev` da **0**, o
  sea, nada de lo que se publica lo trae. Los patrones que procesa son los
  de la configuración del proyecto, no datos de usuarios. Revisar cuando
  salga picomatch 4.0.8 o superior.
- `npx tsc --noEmit` limpio; `npm run build` limpio (páginas estáticas +
  `/api/ocr` y, desde el 2026-11-18, `/api/verificar-dgii` dinámicas).
- `npm test` (vitest, en zona horaria de RD): **140 de 140** pasan (185
  de 185 desde el 2026-11-18, con las reglas de comprobantes, la Ley 30-26
  y la verificación en la DGII; 197 de 197 con el tablero; **219 de 219**
  el 2026-11-19 con el Dashboard en tarjetas y los módulos nuevos) — fechas
  (incluido que `new Date('2026-03-01')` da día 28, el bug de la lección
  1), motor fiscal, reglas del 606 y 607, líneas y archivos generados
  comparados carácter por carácter, dígito verificador, duplicados.
- Recorrido en navegador real (Chromium) contra `next start`, **25 de 25**
  comprobaciones del flujo nuevo: compra por OCR (respuesta simulada) y a
  mano, nota de crédito, retención que exige fecha de pago, venta con
  formas de cobro, factura de consumo menor, e-NCF rechazado en ventas,
  y descarga real de los dos archivos. El 606 descargado fue exactamente:
  `606|401007551|202603|3` + tres líneas de 23 campos, sin salto final,
  con totales RD$1,400.00 / RD$252.00 (la nota de crédito resta). El 607:
  `607|401007551|202603|1` + una línea, y el resumen de consumo (1
  factura, RD$1,000.00 / RD$180.00). Una primera tanda de 41
  comprobaciones cubrió clientes, filtros, persistencia, borrado en
  cascada, datos dañados y móvil antes del cambio de modelo. Los scripts
  vivían en el scratchpad y NO están en el repo.
- Excel: exportado de verdad desde el navegador y leído de vuelta con
  openpyxl y LibreOffice. 606: hojas `Formato 606` y `Resumen`, 3 filas,
  totales 1,400.00 / 252.00, cédula `00112345673` con sus ceros, fila 1
  fija. 607: hojas `Formato 607`, `Resumen` y `Facturas de consumo`. Con
  una factura pendiente el archivo se llamó
  `Formato_606_401007551_202603_INCOMPLETO.xlsx`.
- Tras las decisiones del usuario (ventas como reporte de ingresos,
  clasificación gasto/costo/activo, actividad del cliente): 9 de 9
  comprobaciones nuevas en navegador y 16 de 16 del flujo de compras. Se
  comprobó que la actividad del cliente viaja al servidor, que una compra
  se guarda como revisada sin forma de pago ni retenciones, que una venta
  con e-NCF y solo NCF/fecha/monto/ITBIS se guarda como revisada, y los dos
  Excel leídos de vuelta (606 con columna "Activo"; Ingresos con su hoja y
  resumen).
- Captura por lotes: además de la medición con el PDF real, 15 de 15
  comprobaciones con datos inventados (un QR generado para la prueba):
  lote de 101 páginas rechazado, archivo de texto rechazado, cliente
  equivocado detectado, fotos sueltas con y sin QR, total con coma de miles,
  "Leer con IA lo que falta" con respuesta simulada (no pisa RNC, NCF, fecha
  ni total del QR; llena lo vacío), borrar la factura borra su imagen, la
  factura subida una por una también guarda su imagen, y vista móvil.
  Regresión: 9 de 9 y 16 de 16 de los recorridos anteriores.
- IA automática en lotes (2026-11-17), con el PDF real y la IA simulada:
  19 de 19 comprobaciones — sin código avisa y deja solo el QR; con código
  la IA arranca sola; 58 llamadas, máximo 3 simultáneas; 42 recibos en
  tramos; RNC y actividad del cliente en cada llamada; las 5 páginas de la
  declaración salen como "No es factura"; una lectura fallida se reintenta
  sola (1 llamada más); en la pág. 9 se conservan el e-NCF y el total del
  QR y los montos que no cuadran quedan en observación; 21 listas y 32 con
  observaciones; al aprobar quedan 21 revisadas y entran al 606; con 503
  se detiene tras 3 llamadas. Regresión: 15/15, 9/9 y 16/16.
- Verificación en la DGII (2026-11-18), navegador real contra `next start`
  con la DGII real y la IA simulada, PDF de 15 páginas de la muestra:
  **18 de 18** — se ve el paso 2 de 3; las 5 páginas con QR se consultan (4
  reales "Aceptado" + 1 forzada a "Rechazado"); la rechazada queda con
  observación en el NCF, con aviso en el resumen y marca roja en Facturas;
  se guardan `qrUrl` y la verificación; la razón social y el ITBIS de la
  DGII llenan la factura (en una la DGII no tenía ITBIS y se conservó el de
  la IA); "Verificar en la DGII" en Facturas vuelve a consultar las 5 de
  verdad; una factura suelta (foto con QR) se verifica sola y su NCF queda
  el del QR. Después, con la regla de verificación humana: **26 de 26** —
  además, las e-CF sin QR legible dicen "verifícala a mano" y no quedan
  listas; la serie B sin QR sale "Lista"; "Aprobar las N sin observaciones"
  cuenta solo las serie B; en Facturas las e-CF sin QR llevan "Verificar en
  la DGII" y no entran en "Aprobar las N"; una factura suelta electrónica sin
  QR deja el NCF en ámbar con el aviso. La ruta contra el servidor real: 200 con estado para QR reales
  y "no_encontrado" para uno inventado; 400 para otra dirección o sin JSON;
  401 sin código o con código incorrecto. Regresión: 16/16, 9/9 y 15/15.
  El recorrido de 58 páginas (`e2e7.js`) no se volvió a correr: espera el
  texto "Paso 2 de 2", que ahora es "Paso 3 de 3".
- Separación por empresa (2026-11-18), navegador real contra `next start`:
  **25 de 25** — sin empresas, el menú solo trae "Tus empresas"; se añaden
  dos empresas desde la pantalla; buscar por nombre y por RNC con guiones;
  "Entrar" lleva a `/empresa/<id>` con la franja "Trabajando en…" y el
  bloque "Empresa activa"; en Facturas de una empresa no aparece la factura
  de la otra (sembrada a propósito); la factura nueva queda en la empresa
  activa y el formulario no deja elegir otra; Lote y Reportes sin selector
  de cliente; "Cambiar de empresa" vuelve a la lista; una dirección con id
  inexistente muestra "Esta empresa no existe"; `/facturas` y `/clientes`
  llevan a la lista; eliminar una empresa borra solo sus facturas; móvil
  con "Cambiar" y sin desplazamiento horizontal; el resumen muestra el 606
  de noviembre 2026 (el de octubre ya venció el 15). Las pruebas anteriores,
  adaptadas a las direcciones nuevas: 16/16, 9/9, 15/15 y 26/26. Tras el
  rediseño premium, todo de nuevo: 25/25, 16/16, 9/9, 15/15 y 26/26.
- Tablero y módulos premium (2026-11-18), navegador real contra
  `next start`: **12 de 12** comprobaciones nuevas (`e2e10.js`): "Tablero"
  en el menú, período por defecto, tres vencimientos, indicadores con
  variación, tocar un mes del gráfico cambia el período, flechas, vista de
  tabla, diferencia de ITBIS rotulada como orientativa, empresa sin facturas
  invita a subir el primer lote, Reportes abre en el período en curso. Las
  anteriores, adaptadas a los textos nuevos: 25/25, 16/16, 9/9, 15/15 y
  26/26 (la de la DGII, con la DGII real; el servidor de prueba necesita
  `OCR_CODIGO_ACCESO`). Capturas revisadas de las cuatro pantallas en
  claro, oscuro y móvil (iPhone 13), sin desplazamiento horizontal.
- Módulos independientes y consumidor final (2026-11-19): `npm test`
  **229/229** (nuevas: descarte en el lote por QR y por IA en los dos
  sentidos, venta sin confirmar, B02 sin cliente pasa y B01 no,
  `nombreClienteVenta`, grupos consumidor final / sin identificar,
  `esAprobable`, `exigirTipoDeModulo`, aviso de `validarVentaIngresos`).
  Navegador: 75/75 de los módulos (nuevas: el formulario abre con el tipo
  fijo en cada módulo; una compra subida en Ingresos muestra el aviso y
  "Descartar" cierra sin guardar; en un lote de Costos y gastos la venta
  sale "Descartada" con aviso, solo se guarda la compra y la venta no
  queda en ningún lado), 37/37 del Dashboard, y 27/27, 16/16, 9/9, 15/15 y
  26/26 de los anteriores.
- Dashboard en tarjetas + Ingresos y Costos y gastos (2026-11-19), ya
  fusionados, navegador real contra `next start`: 37/37 del Dashboard y
  74/74 de los módulos; las anteriores, adaptadas a los módulos nuevos
  (Costos y gastos en lugar de Facturas, ventas creadas desde Ingresos,
  menú ⋮ en lugar del lápiz, agenda en lugar del calendario): 27/27,
  16/16, 9/9, 15/15 y 26/26 (la de la DGII, con la DGII real).
- Dato de control del dígito verificador: el algoritmo de la macro da
  correcto el RNC `401007551`.
- Ruta OCR contra el servidor real: sin código o código incorrecto → 401;
  tipo inválido → 400; tipo de archivo no soportado → 415; JSON en vez de
  formulario → 400; más de 4 MB → 413; código correcto con API key falsa →
  la llamada llega a Anthropic, que la rechaza, y la ruta responde 503.
- Versiones: Next 15.5.29, React 18.3.1, TypeScript 5.9.3,
  `@anthropic-ai/sdk` 1.8.0, zod 4.6.7, Tailwind 3.4.19, lucide-react
  0.400.0, vitest 5.1.0, `@types/node` 22 (lo exige vitest 5),
  `pdfjs-dist` 6.5.438, `zxing-wasm` 3.1.7,
  `write-excel-file` 4.1.1 (elegida en vez de `xlsx`/SheetJS, que es la que
  usa Nómina, porque la versión de npm de esa arrastra avisos de seguridad;
  esta solo escribe y `npm audit` queda en 0).

### NO verificado

- **El OCR nunca ha leído una factura real.** No había API key válida: se
  probó todo lo que rodea a la llamada al modelo (que llega a Anthropic y
  es rechazada por la key falsa) y la pantalla de revisión con una
  respuesta simulada, pero no la extracción. Su precisión es desconocida.
- **Los archivos 606 y 607 no se han pasado por el pre-validador de la
  DGII ni se han enviado.** Solo se verificaron contra la macro.
- La lectura de la IA en lote solo se probó con respuestas simuladas;
  tampoco se sabe si los tramos de los recibos se leen bien.
- No hay ESLint configurado.

### Ruta OCR (`POST /api/ocr`)

- Request: encabezado `x-codigo-acceso` + `multipart/form-data` con
  `archivo` (una imagen o un PDF; o hasta 8 imágenes que son tramos de un
  mismo recibo), `tipo` (`compra` | `venta`, el que se asume si no se
  puede deducir), y opcionales `rncCliente` y `actividad`. Hasta 4 MB en
  total. Si faltan `ANTHROPIC_API_KEY` u `OCR_CODIGO_ACCESO` responde 503
  en vez de quedar abierta.
- Modelo por defecto **Haiku 5.5** (`MODELO_OCR_POR_DEFECTO`); el
  navegador pide Sonnet 5.5 (`MODELO_OCR_RELECTURA`) para la relectura (ver
  "Lectura escalonada"). Salida estructurada con Zod, `effort: medium`, y
  fallback de servidor (`fallbacks: 'default'`) solo en los modelos que lo
  tienen (Haiku no). Instrucciones en `system` con caché. El campo opcional
  `modelo` elige uno de `MODELOS_OCR`. La respuesta trae `uso` (modelo,
  tokens y tokens de caché).
- **Límite de complejidad del esquema (arreglado el 2026-11-19)**: la API
  admite como máximo 16 parámetros con tipo unión y 24 opcionales por
  solicitud con salida estructurada (documentación de Anthropic, "Schema
  complexity limits"). Cada `.nullable()` es una unión. El esquema tenía 18
  y la API respondía 400 a TODAS las lecturas: la primera prueba real en
  producción ("la IA no pudo leer ninguna de las facturas") falló por eso. Ahora
  el esquema vive en `src/lib/ocr-esquema.ts`. Los textos y los catálogos
  usan la cadena vacía para "no aparece" (`lecturaDesdeModelo` la vuelve
  null) y solo los 8 montos son nulables. Una prueba cuenta las uniones del
  esquema que envía el SDK. Si la API rechaza una solicitud (400), el mensaje
  de la pantalla trae el motivo de Anthropic.
- No guarda nada. Devuelve `{ esComprobante, tipo, coincideCliente,
  extraccion, confianzaOCR, camposDudosos }` (ver `ResultadoOCR` en
  `src/lib/ocr-tipos.ts`). Lo que no pasa validación vuelve como `null` y
  entra a `camposDudosos`. Lo que le FALTA a la factura lo calcula el
  navegador con las reglas del formato. `confianzaOCR` es autorreportada
  por el modelo: orientativa.

### Procedencia de los parámetros en `dgii-fiscal.ts`

- Copiados del código de `tyui`: tramos de ISR de personas físicas, tasa
  27% del Impuesto Sustitutivo, día 10 del IR-17.
- Verificados el 2026-11-18 (Código Tributario, Ley 30-26, Decreto 293-11
  y el usuario): ITBIS general 18%, tasa reducida 16%, día 20 del IT-1, ISR
  de personas jurídicas 27% y 30% transitorio, escala de personas físicas
  2027, recargo por mora 3% mensual con tope de 100%.
- `⚠️ SIN VERIFICAR` en el código: que las fechas límite no se corren por
  fin de semana o feriado, y el día exacto del fin del calendario de e-CF.
  El viejo recargo "10% + 4% + 1.10%" nunca se codificó y ya no rige.
- Del motor fiscal se usan en pantalla las fechas límite del 606, la IT-1 y
  el IR-17 (Dashboard). Nada calcula impuestos todavía: la "diferencia de
  ITBIS" del Dashboard es una resta orientativa, no la IT-1.
