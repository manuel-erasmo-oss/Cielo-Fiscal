// Modelo de datos de Cielo Cloud Fiscal.
//
// Convenciones:
// - Fechas solo-fecha son strings "YYYY-MM-DD" y se leen SIEMPRE con
//   `parseFechaLocal` (src/lib/utils.ts), nunca con `new Date(iso)`.
// - Instantes (creadoEn, declaradoEn…) son strings ISO 8601 completos con hora.
// - Montos en RD$ como number con 2 decimales (ver `redondear2`).
// - Todo registro lleva `contadorUid`. En el MVP (datos en el navegador, sin
//   cuentas) vale siempre `CONTADOR_LOCAL`; el campo se conserva para que al
//   pasar a Firestore las reglas puedan exigir
//   `contadorUid === request.auth.uid` sin migrar la forma de los datos.
//
// Este archivo NO codifica el layout oficial de columnas del 606/607 ni las
// casillas del IT-1: eso requiere la Norma General / el instructivo vigente
// de la DGII consultado en la sesión que lo implemente (ver CLAUDE.md).

export type FechaISO = string    // "YYYY-MM-DD"
export type InstanteISO = string // ISO 8601 con hora

// Valor de `contadorUid` mientras no hay cuentas (MVP con datos locales).
export const CONTADOR_LOCAL = 'local'

// ─── Cliente ─────────────────────────────────────────────────────────────────

export type TipoPersona = 'juridica' | 'fisica'

// La empresa/persona cuya contabilidad impositiva gestiona el contador.
export interface ClienteFiscal {
  id: string
  contadorUid: string
  tipoPersona: TipoPersona
  // RNC (persona jurídica) o cédula (persona física), solo dígitos.
  rncCedula: string
  razonSocial: string
  nombreComercial?: string
  // A qué se dedica, en palabras del contador. Se le pasa al OCR para que
  // distinga costo, gasto y activo: la misma compra puede ser inventario
  // para un negocio y gasto para otro.
  actividad?: string
  // Mes (1-12) en que cierra su ejercicio fiscal. Sin default: las fechas de
  // cierre admitidas por la DGII no se han verificado en este proyecto.
  mesCierreFiscal?: number
  activo: boolean
  creadoEn: InstanteISO
  actualizadoEn: InstanteISO
}

// ─── Documento (factura) ─────────────────────────────────────────────────────
// Los campos siguen las columnas de los formatos de envío 606 (compras) y
// 607 (ventas) de la DGII. Especificación y fuentes: docs/dgii/formatos-606-607.md

// 'compra' alimenta el 606; 'venta' alimenta el 607.
export type TipoDocumento = 'compra' | 'venta'

// Campos que una persona (o el OCR) llena. `camposIncompletos` usa estos
// nombres. Un mismo registro guarda todos; los que no aplican a su tipo
// quedan en null.
export type CampoExtraido =
  // ── Comunes ──
  | 'rncCedulaContraparte'
  | 'nombreContraparte'
  | 'ncf'
  | 'ncfModificado'
  | 'fechaComprobante'
  | 'itbisFacturado'
  | 'impuestoSelectivoConsumo'
  | 'otrosImpuestos'
  | 'propinaLegal'
  | 'montoTotal'
  // ── Solo compra (606) ──
  | 'tipoBienesServicios'
  | 'fechaPago'
  | 'montoServicios'
  | 'montoBienes'
  | 'itbisRetenido'
  | 'itbisProporcionalidad'
  | 'itbisLlevadoAlCosto'
  | 'tipoRetencionISR'
  | 'montoRetencionRenta'
  | 'formaPago'
  // ── Solo venta (607) ──
  | 'tipoIdentificacion'
  | 'tipoIngreso'
  | 'fechaRetencion'
  | 'montoFacturado'
  | 'itbisRetenidoTerceros'
  | 'retencionRentaTerceros'
  | 'cobroEfectivo'
  | 'cobroCheque'
  | 'cobroTarjeta'
  | 'cobroCredito'
  | 'cobroBonos'
  | 'cobroPermuta'
  | 'cobroOtras'

export type EstadoRevision =
  // Recién extraído por OCR; nadie lo ha mirado todavía.
  | 'pendiente_revision'
  // Un humano confirmó/corrigió los campos. Único estado que puede entrar a
  // un reporte que se vaya a declarar.
  | 'revisado'
  // Descartado (duplicado, ilegible, no es una factura fiscal…).
  | 'descartado'

export interface DocumentoFiscal {
  id: string
  contadorUid: string
  clienteId: string
  tipo: TipoDocumento

  // 'ocr': los campos salieron de la extracción automática. 'manual': los
  // digitó una persona desde cero.
  origen: 'ocr' | 'manual'

  // En el MVP el archivo NO se conserva: se usa para el OCR y la revisión, y
  // solo queda su nombre como referencia. `archivoPath` es la ruta en Storage
  // cuando exista almacenamiento en la nube; nunca se embebe el archivo aquí.
  archivoNombre?: string
  archivoMimeType?: string
  archivoPath?: string

  // ── Comunes a 606 y 607 (null = sin dato) ──
  // Proveedor en una compra, cliente en una venta. RNC/cédula: solo dígitos.
  rncCedulaContraparte: string | null
  // No va en ningún formato; es para que la persona reconozca la factura.
  nombreContraparte: string | null
  ncf: string | null
  // NCF afectado, cuando el comprobante es una nota de crédito/débito.
  ncfModificado: string | null
  fechaComprobante: FechaISO | null
  itbisFacturado: number | null
  impuestoSelectivoConsumo: number | null
  otrosImpuestos: number | null
  propinaLegal: number | null
  // Total impreso en la factura. No va en ningún formato: sirve para cuadrar.
  montoTotal: number | null

  // ── Solo compra (606) ──
  // Código de 2 dígitos del catálogo "Tipo de bienes y servicios comprados".
  tipoBienesServicios: string | null
  fechaPago: FechaISO | null
  // Sin impuestos. El "total monto facturado" del 606 es la suma de ambos.
  montoServicios: number | null
  montoBienes: number | null
  itbisRetenido: number | null
  itbisProporcionalidad: number | null
  itbisLlevadoAlCosto: number | null
  // Código de 2 dígitos del catálogo "Tipo de retención en ISR".
  tipoRetencionISR: string | null
  montoRetencionRenta: number | null
  // Código de 2 dígitos del catálogo "Forma de pago".
  formaPago: string | null

  // ── Solo venta (607) ──
  // '1' RNC, '2' cédula, '3' pasaporte o ID tributaria.
  tipoIdentificacion: string | null
  // Código de 1 dígito del catálogo "Tipo de ingreso".
  tipoIngreso: string | null
  fechaRetencion: FechaISO | null
  // Sin impuestos.
  montoFacturado: number | null
  itbisRetenidoTerceros: number | null
  retencionRentaTerceros: number | null
  // Cómo se cobró la venta, con impuestos incluidos.
  cobroEfectivo: number | null
  cobroCheque: number | null
  cobroTarjeta: number | null
  cobroCredito: number | null
  cobroBonos: number | null
  cobroPermuta: number | null
  cobroOtras: number | null

  // ── Confianza de la extracción (snapshot en el dato, no solo en la UI) ──
  // 0..1, autorreportada por el modelo — orientativa, no una probabilidad
  // calibrada. Sirve para ordenar la cola de revisión, no para saltársela.
  confianzaOCR: number
  // Campos de los que el OCR dudó y que nadie ha tocado, más los que
  // impedían marcarla como revisada al guardarla como pendiente.
  camposIncompletos: CampoExtraido[]
  estadoRevision: EstadoRevision
  revisadoEn?: InstanteISO

  creadoEn: InstanteISO
  actualizadoEn: InstanteISO
}

// ─── Registros declarables ───────────────────────────────────────────────────
// Regla de inmutabilidad (lección de Cielo Cloud Nómina, ver CLAUDE.md): un
// registro con `declarado: true` es histórico. No se recalcula en vivo ni se
// edita aunque cambie una factura después; solo se puede alterar deshaciendo
// primero la declaración. El guard debe vivir en los datos (reglas de
// Firestore + capa de escritura), no solo en la UI.

interface RegistroDeclarable {
  id: string
  contadorUid: string
  clienteId: string
  anio: number
  mes: number // 1-12
  declarado: boolean
  declaradoEn?: InstanteISO
  creadoEn: InstanteISO
  actualizadoEn: InstanteISO
}

// Snapshot mensual del Formato 606 (compras) o 607 (ventas), construido desde
// los `DocumentoFiscal` revisados de ese mes. TODAVÍA NO SE USA: hoy el
// archivo se genera al vuelo desde las facturas y no se guarda. Cuando
// exista "marcar como declarado", el snapshot debe guardar el contenido
// exacto del archivo enviado.
export interface ReporteFormato606607 extends RegistroDeclarable {
  formato: '606' | '607'
  // Trazabilidad: qué documentos entraron al reporte.
  documentoIds: string[]
  cantidadDocumentos: number
  totalMontoFacturado: number
  totalItbisFacturado: number
}

// Declaración mensual de ITBIS (IT-1). Solo la aritmética base sobre 606+607;
// las casillas reales del formulario (retenciones, proporcionalidad, etc.)
// están pendientes de la fuente oficial.
export interface DeclaracionITBIS extends RegistroDeclarable {
  reporte606Id?: string
  reporte607Id?: string
  // ITBIS cobrado en ventas (607).
  itbisFacturado: number
  // ITBIS pagado en compras (606) que se adelanta.
  itbisAdelantado: number
  saldoAFavorAnterior: number
  // Resultado: exactamente uno de los dos es > 0, o ambos 0.
  itbisAPagar: number
  saldoAFavorSiguiente: number
  fechaLimite: FechaISO
}

// Declaración mensual de retenciones (IR-17). Mismo concepto ya implementado
// en Cielo Cloud Nómina; el desglose por tipo de retención se define al
// implementar el paso 6 del roadmap contra el formulario vigente.
export interface DeclaracionIR17 extends RegistroDeclarable {
  totalRetenciones: number
  fechaLimite: FechaISO
}

// Proyección (no declaración) del ISR anual a pagar. Es una estimación para
// planificación del cliente; nunca se marca como declarada.
export interface ProyeccionISR {
  id: string
  contadorUid: string
  clienteId: string
  anioFiscal: number
  tipoPersona: TipoPersona
  ingresosProyectados: number
  gastosDeduciblesProyectados: number
  rentaNetaImponibleProyectada: number
  isrProyectado: number
  // Supuestos en texto libre que el contador quiere dejar registrados.
  supuestos?: string
  calculadoEn: InstanteISO
}
