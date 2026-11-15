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
4. **Los archivos de las facturas no se guardan.** Se envían al servidor
   solo para leerlos; queda el nombre del archivo como referencia. Para
   re-revisar una factura contra su imagen hay que volver a subirla.
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
- `DocumentoFiscal` — una factura (compra o venta) con los campos
  extraídos por OCR + `confianzaOCR`/`camposIncompletos` para revisión
  manual. El archivo real vive en Storage (`archivoPath`), nunca embebido.
- `ReporteFormato606607` — snapshot mensual construido desde los
  `DocumentoFiscal` de ese mes, con `documentoIds[]` para trazabilidad.
- `DeclaracionITBIS`, `DeclaracionIR17`, `ProyeccionISR` — ver comentarios
  inline en el propio archivo.

## Motor fiscal (`src/lib/dgii-fiscal.ts`)

Confirmado/reutilizado de Cielo Cloud Nómina (ya verificado allá contra
fuente oficial): ISR personas jurídicas 27%, tramos de ISR personas
físicas (Ley 11-92, mismos 4 tramos que el motor de nómina), Impuesto
Sustitutivo de Retribuciones Complementarias 27%, día límite IR-17 (10,
confirmado contra la Guía No.14 DGII).

**Pendiente de verificación oficial antes de producción**:
- Tasa ITBIS reducida (16%) y catálogo exacto de bienes — solo se asume la
  general 18% por ahora.
- Día límite exacto de 606/607/IT-1 (`DIA_LIMITE_IT1_606_607 = 20` es un
  placeholder sin confirmar).
- Layout exacto de columnas de los archivos 606/607 que exige la Oficina
  Virtual DGII (NCF vs. e-CF, transición por Ley 32-23) — no se ha
  construido ningún generador de archivo todavía, a propósito, hasta tener
  la fuente oficial.

## Requisito de captura (dicho por el usuario el 2026-11-15) — NO construido todavía

El cliente va a subir **tres tipos de entrada**, y el sistema tiene que
soportar las tres:

1. **Fotos tomadas con el celular.**
2. **Un PDF con una sola factura.**
3. **PDFs con cientos de facturas.**

Lo construido hasta hoy solo cubre "un archivo de hasta 4 MB = una
factura". El caso 3 no cabe en ese diseño y obliga a rehacer la captura.
Variables a contemplar al diseñarla (lista de trabajo, no cerrada):

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
- **Revisión a escala**: revisar a mano campo por campo cientos de
  facturas no es viable. Hace falta priorizar (validaciones automáticas +
  confianza) para que la persona mire primero las dudosas. Cuánto se puede
  aprobar en bloque es una **decisión de producto pendiente de confirmar
  con el usuario** (lección 4: nada entra a un reporte sin revisión).
- **Imagen durante la revisión**: hoy el archivo no se guarda (decisión 4
  del MVP). Con cientos de facturas la revisión no se termina en una
  sentada, así que al volver ya no habría imagen contra la cual comparar.
  Hay que guardar las páginas en el navegador (IndexedDB) o pedir que se
  vuelva a subir el PDF. Pendiente de decidir.
- **Volumen en `localStorage`**: sirve para miles de facturas, no para
  decenas de miles. Vigilarlo.

**El usuario va a enviar el formato de envío vigente del 606 (costos y
gastos) y del 607 (ventas).** Hasta tenerlos NO se fijan los campos que
extrae el OCR ni se construye ningún generador: esos formatos definen qué
datos hay que capturar de cada factura (hoy se capturan 9 campos elegidos
sin esa fuente).

## Roadmap (MVP angosto primero)

1. ✅ **Clientes** (`ClienteFiscal`, CRUD) — hecho el 2026-11-15, sin auth
   (ver decisión de arquitectura del MVP).
2. ✅ **Facturas**: subida de imagen/PDF → `POST /api/ocr` → revisión manual
   de campos → `DocumentoFiscal`; también captura a mano. Hecho el
   2026-11-15, **pero el OCR no se ha probado con una factura real**.
3. ⏭️ **Siguiente**: (a) recibir del usuario los formatos de envío del 606
   y 607 y ajustar los campos de `DocumentoFiscal` y del OCR a lo que esos
   formatos exigen; (b) rediseñar la captura para los tres tipos de entrada
   (ver "Requisito de captura"); (c) medir el OCR con facturas reales
   (requiere desplegar en Vercel); (d) Reporte 606.
4. Reporte 607 (ventas).
5. Declaración ITBIS mensual (ya es solo aritmética sobre 606+607).
6. IR-17 (adaptar el mismo concepto ya implementado en Nómina).
7. Proyección de ISR.
8. Migración a Firebase (cuentas, datos en la nube, archivos en Storage)
   cuando el MVP esté validado.
9. Hub/landing compartido de la suite, si hay ya 2+ productos en venta.

Candidatos sin decidir (confirmar con el usuario antes de hacerlos):
respaldo/exportación de los datos del navegador; subida de varias facturas
a la vez; estado "descartada" en la interfaz (el tipo ya lo contempla).

## Lo que falta para probarlo de verdad

1. ~~Repo de GitHub~~ — HECHO: `manuel-erasmo-oss/Cielo-Fiscal`.
2. **Desplegar en Vercel** (lo hace el usuario una vez): importar el repo y
   definir dos variables de entorno del servidor, `ANTHROPIC_API_KEY` y
   `OCR_CODIGO_ACCESO` (ver `.env.example`). Vercel publica desde la rama
   de producción, así que el trabajo tiene que llegar a `main`.
3. **`ANTHROPIC_API_KEY` propia del producto** — nunca una key personal.
4. Firebase project nuevo y reglas de seguridad: **pospuesto** hasta la
   migración (paso 8 del roadmap).

## Nombre del producto

"Cielo Cloud Fiscal" es un nombre sugerido, no una decisión final — cambiar
el texto es trivial (branding, título, metadata) si el usuario prefiere
otro (ej. "Cielo Cloud Impuestos", "Cielo Cloud 606").

## Branch / repo de trabajo

- Repo: `manuel-erasmo-oss/Cielo-Fiscal`.
- Branch de desarrollo de la sesión que trajo este archivo:
  `claude/new-session-697xwv`.

## Estado real del repo (2026-11-15)

Este archivo se escribió en la sesión de Cielo Cloud Nómina describiendo un
scaffold que vivía solo en aquel sandbox; el código no vino con él. En la
sesión del 2026-11-15 se recreó el scaffold en este repo y, tras la
decisión de arquitectura del MVP, se construyeron los pasos 1 y 2 del
roadmap.

### Qué hay en el árbol

- **Pantallas** (`src/app`): `/` Inicio (conteos y facturas por revisar por
  cliente), `/clientes` (alta, edición, borrado en cascada), `/facturas`
  (filtros por cliente/tipo/mes/estado, totales, alta por OCR o a mano,
  edición, borrado), `/configuracion` (código de acceso al OCR).
- **Servidor**: solo `src/app/api/ocr/route.ts`.
- **Datos** (`src/lib/datos`): `repositorio.ts` (interfaz),
  `repositorio-local.ts` (`localStorage`, claves `cielo-fiscal:clientes:v1`
  y `cielo-fiscal:documentos:v1`), `datos-context.tsx` (estado compartido).
- **Lógica pura** (`src/lib`): `documentos.ts` (campos requeridos, qué
  factura puede entrar a un reporte, duplicados, validación de cliente),
  `dgii-fiscal.ts` (motor fiscal), `utils.ts` (fechas locales, montos),
  `ocr-tipos.ts` (contrato servidor↔navegador), `ocr-cliente.ts` (prepara
  el archivo y llama a la ruta), `config-local.ts`.
- **Interfaz** (`src/components`): `layout/` (Sidebar portado de Nómina sin
  selector de empresa ni logout, Header, BottomNav, Pagina), `ui/`
  (Toast, Badge, EmptyState, ThemeToggle y StatCard copiados de Nómina;
  Modal y ConfirmDialog nuevos), `clientes/ClienteModal`,
  `facturas/FacturaModal`.
- Copiados byte a byte de `manuel-erasmo-oss/tyui` (commit `1555027`):
  `src/app/globals.css`, `postcss.config.mjs`, `tsconfig.json`,
  `.gitignore`. `tailwind.config.ts` es igual salvo una línea añadida al
  `content` (`./src/lib/**`): sin ella el gradiente de `BTN_PRIMARY` no se
  generaba, porque aquí esas clases solo aparecen en `src/lib/utils.ts`.

### Reglas de negocio ya implementadas (y probadas)

- Una factura se guarda como **pendiente** (puede estar incompleta) o como
  **revisada** (exige RNC/cédula, nombre, NCF, fecha, monto, ITBIS y total).
  `esIncluibleEnReporte` es el único criterio para que entre a un reporte:
  revisada Y completa. Los reportes futuros deben usar esa función.
- Los campos de los que el OCR dudó se marcan en ámbar hasta que una
  persona los toca. ITBIS en cero es un dato válido, no un faltante.
- **Duplicado** = mismo cliente, mismo tipo, mismo NCF y misma contraparte.
  Se avisa y no se deja marcar como revisada dos veces.
- Si monto + ITBIS no coincide con el total se muestra un aviso que NO
  bloquea (una factura puede traer otros cargos).
- RNC/cédula: solo se valida la longitud (9 u 11 dígitos). El dígito
  verificador NO se comprueba — su algoritmo no se consultó en fuente
  oficial. El formato del NCF tampoco se valida, por la misma razón.
- Datos dañados en `localStorage` producen un aviso y **no se
  sobrescriben**.
- Fotos de más de 4 MB se reducen en el navegador (lado mayor 2200 px,
  JPEG) antes de subir; el tope de 4 MB existe por el límite de 4.5 MB del
  cuerpo de una función de Vercel (dato recordado, no re-verificado en la
  documentación de Vercel).

### Verificado el 2026-11-15 (resultado real)

- `npm audit`: **0 vulnerabilidades**, con un `override` en `package.json`
  que fuerza `postcss` ^8.5.33 dentro de Next 15.5.29 (que fija 8.4.31, con
  avisos altos). Al quitar Firebase desapareció el otro override.
- `npx tsc --noEmit` limpio; `npm run build` limpio (4 páginas estáticas +
  `/api/ocr` dinámica).
- `npm test` (vitest, en zona horaria de RD): **40 de 40** pasan — fechas
  (incluido que `new Date('2026-03-01')` da día 28, el bug de la lección
  1), motor fiscal, reglas de facturas, duplicados, validación de cliente.
- Recorrido en navegador real (Chromium) contra `next start`: **41 de 41**
  comprobaciones — alta/edición/borrado de clientes, captura manual,
  flujo OCR con respuesta simulada, duplicados, reducción de imagen
  (37.9 MB → 2.81 MB), totales (RD$3,500.50 / RD$180.00 / RD$1,180.00),
  filtros, persistencia tras recargar, borrado en cascada, datos dañados,
  vista móvil sin desborde, sin errores de consola. El script vivía en el
  scratchpad de la sesión y NO está en el repo: no hay pruebas de
  navegador automatizadas todavía.
- Ruta OCR contra el servidor real: sin código o código incorrecto → 401;
  tipo inválido → 400; tipo de archivo no soportado → 415; JSON en vez de
  formulario → 400; más de 4 MB → 413; código correcto con API key falsa →
  la llamada llega a Anthropic, que la rechaza, y la ruta responde 503.
- Versiones: Next 15.5.29, React 18.3.1, TypeScript 5.9.3,
  `@anthropic-ai/sdk` 1.8.0, zod 4.6.7, Tailwind 3.4.19, lucide-react
  0.400.0, vitest 5.1.0, `@types/node` 22 (lo exige vitest 5).

### NO verificado

- **El OCR nunca ha leído una factura real.** No había API key válida: se
  probó todo lo que rodea a la llamada al modelo y la pantalla de revisión
  con una respuesta simulada, pero no la extracción. Su precisión es
  desconocida.
- No se ha desplegado en Vercel.
- No hay ESLint configurado.

### Ruta OCR (`POST /api/ocr`)

- Request: encabezado `x-codigo-acceso` + `multipart/form-data` con
  `archivo` y `tipo` (`compra` | `venta`). Acepta JPEG/PNG/WebP/GIF/PDF
  hasta 4 MB. Si faltan `ANTHROPIC_API_KEY` u `OCR_CODIGO_ACCESO` responde
  503 en vez de quedar abierta.
- Modelo `claude-opus-5-5`, salida estructurada con Zod, `effort: medium`,
  con fallback de servidor (`fallbacks: 'default'`). Cambiar de modelo es
  una constante (`MODELO_OCR`) — decisión de costo/precisión pendiente de
  medir con facturas reales.
- No guarda nada. Devuelve `{ extraccion, confianzaOCR, camposIncompletos }`.
  Lo que no pasa validación (fecha inexistente, monto negativo) vuelve como
  `null` y entra a `camposIncompletos`. `confianzaOCR` es autorreportada por
  el modelo: orientativa.

### Procedencia de los parámetros en `dgii-fiscal.ts`

- Copiados del código de `tyui`: tramos de ISR de personas físicas, tasa
  27% del Impuesto Sustitutivo, día 10 del IR-17.
- Tomado de este documento, sin respaldo en el código de `tyui` ni
  re-verificación: ISR de personas jurídicas 27%.
- `⚠️ SIN VERIFICAR` en el código: ITBIS general 18%, día 20 para
  606/607/IT-1, y que las fechas límite no se corren por fin de semana o
  feriado. El recargo "10% + 4% + 1.10%" del IR-17 que menciona la lección
  2 NO se codificó: no aparece en el código de `tyui` y este documento no
  dice cómo se aplica cada porcentaje.
- Nada del motor fiscal se usa todavía en pantalla: los pasos 1 y 2 no
  calculan impuestos.
