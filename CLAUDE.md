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

## Roadmap sugerido (MVP angosto primero)

1. Auth + `ClienteFiscal` (CRUD) — reutilizar el patrón de multicuenta de
   Firebase ya portado a `src/lib/firebase.ts`.
2. Subida de documento (imagen/PDF) → Storage → `src/app/api/ocr/route.ts`
   → `DocumentoFiscal` con revisión manual de campos de baja confianza.
3. Reporte 606 (el más simple de los dos, compras) — probar la precisión
   real del OCR y el formato DGII correcto antes de expandir.
4. Reporte 607 (ventas).
5. Declaración ITBIS mensual (ya es solo aritmética sobre 606+607).
6. IR-17 (adaptar el mismo concepto ya implementado en Nómina).
7. Proyección de ISR.
8. Recién en esta fase: hub/landing compartido de la suite, si hay ya 2+
   productos reales en venta.

## Lo que falta para que esto sea un proyecto real (no solo scaffold local)

Este árbol de archivos existe hoy solo en el sandbox de la sesión — para
que sobreviva y se vuelva un proyecto de Claude Code de verdad:

1. ~~**Repo de GitHub nuevo y vacío**~~ — HECHO (2026-11-15): el usuario
   creó `manuel-erasmo-oss/Cielo-Fiscal` y lo conectó a una sesión de
   Claude Code. Ver "Estado real del repo" abajo.
2. **Firebase project nuevo** (separado del de Nómina, por limpieza de
   seguridad/facturación) — Auth, Firestore, Storage habilitados; llenar
   `.env.local` a partir de `.env.example`.
3. **`ANTHROPIC_API_KEY`** propia para el endpoint de OCR — nunca
   reutilizar una key personal en un producto que se va a vender.
4. Reglas de seguridad de Firestore/Storage reales (aislamiento por
   `contadorUid`) — no se han escrito todavía, es boilerplate crítico antes
   de cualquier dato real.

## Nombre del producto

"Cielo Cloud Fiscal" es un nombre sugerido, no una decisión final — cambiar
el texto es trivial (branding, título, metadata) si el usuario prefiere
otro (ej. "Cielo Cloud Impuestos", "Cielo Cloud 606").

## Branch / repo de trabajo

- Repo: `manuel-erasmo-oss/Cielo-Fiscal`.
- Branch de desarrollo de la sesión que trajo este archivo:
  `claude/new-session-697xwv`.

## Estado real del repo (2026-11-15)

Este archivo se escribió en la sesión de Cielo Cloud Nómina, describiendo
un scaffold que vivía solo en el sandbox de aquella sesión. Al traerlo a
este repo, **el código del scaffold NO vino con él**: el repo contiene
únicamente `README.md` y este `CLAUDE.md`. Todo lo que arriba se menciona
como existente (`src/app/api/ocr/route.ts`, `src/lib/utils.ts`,
`src/lib/firebase.ts`, `src/lib/dgii-fiscal.ts`, `src/types/index.ts`,
`tailwind.config.ts`, `globals.css`, `page.tsx`, `.env.example`) y lo
verificado allí (`npm audit`, `npx tsc --noEmit`, `npm run build` limpios)
es diseño documentado, pendiente de recrear y re-verificar aquí — no
asumir que esos archivos existen hasta que estén en el árbol.
