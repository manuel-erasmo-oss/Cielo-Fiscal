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
- Día límite del IT-1 (`DIA_LIMITE_IT1 = 20` es un placeholder sin
  confirmar). El de los formatos 606 y 607 **sí está verificado: día 15**
  (antes se asumía 20 y era incorrecto).

**Ya verificado con fuente oficial (2026-11-15)**: layout de los archivos
606 y 607 — ver la sección "Formatos 606 y 607" y
`docs/dgii/formatos-606-607.md`.

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

Los formatos del 606 y 607 ya se recibieron y los campos de la factura ya
siguen sus columnas (ver "Formatos 606 y 607"). Lo que sigue pendiente de
este requisito es la captura en sí: partir PDFs grandes, procesar por
partes, y la revisión a escala.

## Costo y límites (aprobado por el usuario el 2026-11-15) — NO construido todavía

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

**Propuesta pendiente de medir (no decidida):** lectura escalonada — leer
cada página con el modelo barato y volver a leer con uno más fuerte solo
las que fallen validaciones automáticas (monto + ITBIS ≠ total, RNC de
longitud incorrecta, fecha fuera del período, campo requerido vacío). No
apoyarse en la confianza que reporta el propio modelo: no es confiable
para decidir esto. Se le dijo al usuario explícitamente que **no se sabe**
si Haiku lee bien fotos malas, papel térmico o manuscritas; eso es lo que
la medición tiene que responder, campo por campo (un dígito mal en un RNC
o NCF es un error fiscal, no un detalle).

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
- **606**: tipo de bienes y servicios y forma de pago son obligatorios y
  NO están impresos en la factura: los decide el contador. Lo mismo las
  retenciones y el tratamiento del ITBIS. El OCR no los intenta.
- **607**: las facturas de consumo (tipo 02) menores de RD$250,000 no van
  en el archivo; van como totales en el "Resumen General de Facturas de
  Consumo" de la Oficina Virtual. La pantalla de Reportes los calcula.
- El dígito verificador está en las macros pero **desactivado**; aquí se
  usa solo como aviso, nunca bloquea.

**Dudas abiertas (decírselas al usuario; no resolverlas de memoria):**

1. **La herramienta 607 entregada es la versión 2023.1.1 y rechaza los
   e-NCF (serie E)**; la del 606 es la versión 2025 y sí los acepta. Hoy
   una venta con e-NCF no se puede marcar como revisada. Falta saber si
   existe una herramienta 607 más nueva.
2. **Segunda remisión por retenciones** (606): el instructivo dice que un
   NCF se vuelve a enviar cuando se paga en otro mes para reportar las
   retenciones. No está modelado: cada factura pertenece solo al mes de su
   fecha de comprobante.
3. El archivo generado **no se ha pasado por la Herramienta de
   Pre-validación de la DGII** (es una aplicación de Windows). Solo se
   verificó contra la lógica de la macro. Lo tiene que probar el usuario.
4. Qué significa cada tipo de e-CF (31-34, 41-47) no está en las fuentes;
   no se codificó nada que dependa de ello (por eso una nota de crédito
   electrónica no resta en los totales, igual que en la macro).
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
   - Pendiente de confirmar con el usuario: en el 607 la macro exige al
     menos una forma de cobro con monto. Hoy sigue siendo obligatoria por
     factura; no se sabe si el usuario quiere el mismo trato que en el 606.

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
  este caso.
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

Esto alimenta el rediseño de la captura (ver "Requisito de captura"): leer
el QR en el navegador antes de llamar al OCR, partir las tiras largas,
descartar páginas que no son facturas.

## Roadmap (MVP angosto primero)

1. ✅ **Clientes** (`ClienteFiscal`, CRUD) — hecho el 2026-11-15, sin auth
   (ver decisión de arquitectura del MVP).
2. ✅ **Facturas**: subida de imagen/PDF → `POST /api/ocr` → revisión manual
   de campos → `DocumentoFiscal`; también captura a mano. Hecho el
   2026-11-15, **pero el OCR no se ha probado con una factura real**.
3. ✅ **Campos de la factura alineados con los formatos 606 y 607** y
   **generación de los archivos TXT** del 606 y del 607 (pantalla
   Reportes) — hecho el 2026-11-15 contra las fuentes oficiales. Falta que
   el usuario pase un archivo por el pre-validador de la DGII.
4. ⏭️ **Siguiente**: (a) medir el OCR con facturas reales, comparando
   modelos (requiere API key y facturas de muestra); (b) rediseñar la
   captura para fotos, PDF de una factura y PDF de cientos (ver "Requisito
   de captura"); (c) snapshot al declarar; (d) resolver las dudas abiertas
   de "Formatos 606 y 607".
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
  edición, borrado), `/reportes` (genera y descarga el TXT del 606 o 607
  de un cliente y un mes, y lo exporta a Excel), `/configuracion` (código
  de acceso al OCR).
- **Servidor**: solo `src/app/api/ocr/route.ts`.
- **Datos** (`src/lib/datos`): `repositorio.ts` (interfaz),
  `repositorio-local.ts` (`localStorage`, claves `cielo-fiscal:clientes:v1`
  y `cielo-fiscal:documentos:v1`), `datos-context.tsx` (estado compartido).
- **Lógica pura** (`src/lib`): `dgii-formatos.ts` (catálogos, reglas y
  generadores del 606 y 607), `documentos.ts` (qué factura puede marcarse
  revisada y entrar a un reporte, duplicados, validación de cliente),
  `excel-reporte.ts` (arma las hojas del Excel del 606/607),
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
  **revisada**. Revisada exige que el formato de la DGII no le objete nada
  (`problemasDeRevision` → `validarCompra606` / `validarVenta607`).
  `esIncluibleEnReporte` es el único criterio para entrar a un reporte.
- Los problemas tienen nivel `error` (bloquea) o `aviso` (solo se muestra:
  dígito verificador que no cuadra, cobros que no suman el total).
- El OCR extrae lo impreso (RNC, nombre, NCF, fechas, montos, impuestos,
  forma de pago si aparece). En compras además reparte el subtotal entre
  servicios y bienes (dudoso si no está seguro o si no suma el subtotal) y
  elige el tipo de bienes y servicios. Retenciones, tipo de ingreso y
  formas de cobro los llena la persona.
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
- **Exportar a Excel** (requisito del usuario: "es vital"): papel de
  trabajo, no lo que se envía a la DGII. Hoja 1 = tabla limpia con las 23
  columnas del formato (mismos valores que el TXT; una prueba compara cada
  fila contra la línea del TXT) + nombre y total como referencia; hoja
  "Resumen" con totales y estado; en el 607, hoja "Facturas de consumo".
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

- `npm audit`: **0 vulnerabilidades**, con un `override` en `package.json`
  que fuerza `postcss` ^8.5.33 dentro de Next 15.5.29 (que fija 8.4.31, con
  avisos altos). Al quitar Firebase desapareció el otro override.
- `npx tsc --noEmit` limpio; `npm run build` limpio (4 páginas estáticas +
  `/api/ocr` dinámica).
- `npm test` (vitest, en zona horaria de RD): **86 de 86** pasan — fechas
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
- Dato de control del dígito verificador: el algoritmo de la macro da
  correcto el RNC `401007551`.
- Ruta OCR contra el servidor real: sin código o código incorrecto → 401;
  tipo inválido → 400; tipo de archivo no soportado → 415; JSON en vez de
  formulario → 400; más de 4 MB → 413; código correcto con API key falsa →
  la llamada llega a Anthropic, que la rechaza, y la ruta responde 503.
- Versiones: Next 15.5.29, React 18.3.1, TypeScript 5.9.3,
  `@anthropic-ai/sdk` 1.8.0, zod 4.6.7, Tailwind 3.4.19, lucide-react
  0.400.0, vitest 5.1.0, `@types/node` 22 (lo exige vitest 5),
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
- No guarda nada. Devuelve `{ extraccion, confianzaOCR, camposDudosos }`.
  Lo que no pasa validación (fecha inexistente, monto negativo) vuelve como
  `null` y entra a `camposDudosos`. Lo que le FALTA a la factura lo calcula
  el navegador con las reglas del formato (necesita el RNC del cliente).
  `confianzaOCR` es autorreportada por el modelo: orientativa.

### Procedencia de los parámetros en `dgii-fiscal.ts`

- Copiados del código de `tyui`: tramos de ISR de personas físicas, tasa
  27% del Impuesto Sustitutivo, día 10 del IR-17.
- Tomado de este documento, sin respaldo en el código de `tyui` ni
  re-verificación: ISR de personas jurídicas 27%.
- `⚠️ SIN VERIFICAR` en el código: ITBIS general 18%, día 20 para el
  IT-1, y que las fechas límite no se corren por fin de semana o feriado. El recargo "10% + 4% + 1.10%" del IR-17 que menciona la lección
  2 NO se codificó: no aparece en el código de `tyui` y este documento no
  dice cómo se aplica cada porcentaje.
- Del motor fiscal solo se usa en pantalla la fecha límite del 606/607.
  Nada calcula impuestos todavía.
