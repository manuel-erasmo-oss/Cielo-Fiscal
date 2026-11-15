import {
  validarCompra606,
  validarVentaIngresos,
  type CamposDocumento,
  type Problema,
} from '@/lib/dgii-formatos'
import { soloDigitos } from '@/lib/utils'
import type { CampoExtraido, ClienteFiscal, DocumentoFiscal, TipoDocumento } from '@/types'

export type { CamposDocumento } from '@/lib/dgii-formatos'

// Lógica pura sobre clientes y facturas: sin React, sin almacenamiento. Todo
// lo que decide si un dato puede entrar a un reporte vive aquí, para que la
// regla sea la misma la aplique la pantalla, el OCR o (más adelante) el
// servidor. Las reglas de los formatos 606/607 están en dgii-formatos.ts.

const COMUNES = [
  'rncCedulaContraparte',
  'nombreContraparte',
  'ncf',
  'ncfModificado',
  'fechaComprobante',
  'itbisFacturado',
  'impuestoSelectivoConsumo',
  'otrosImpuestos',
  'propinaLegal',
  'montoTotal',
] as const satisfies readonly CampoExtraido[]

const SOLO_COMPRA = [
  'tipoBienesServicios',
  'fechaPago',
  'montoServicios',
  'montoBienes',
  'itbisRetenido',
  'itbisProporcionalidad',
  'itbisLlevadoAlCosto',
  'tipoRetencionISR',
  'montoRetencionRenta',
  'formaPago',
] as const satisfies readonly CampoExtraido[]

const SOLO_VENTA = [
  'tipoIdentificacion',
  'tipoIngreso',
  'fechaRetencion',
  'montoFacturado',
  'itbisRetenidoTerceros',
  'retencionRentaTerceros',
  'cobroEfectivo',
  'cobroCheque',
  'cobroTarjeta',
  'cobroCredito',
  'cobroBonos',
  'cobroPermuta',
  'cobroOtras',
] as const satisfies readonly CampoExtraido[]

export const CAMPOS_EXTRAIDOS = [...COMUNES, ...SOLO_COMPRA, ...SOLO_VENTA] as const

// Campos que aplican a cada tipo de factura; el resto queda en null.
export const CAMPOS_POR_TIPO: Record<TipoDocumento, readonly CampoExtraido[]> = {
  compra: [...COMUNES, ...SOLO_COMPRA],
  venta: [...COMUNES, ...SOLO_VENTA],
}

export const CAMPOS_FECHA: readonly CampoExtraido[] = ['fechaComprobante', 'fechaPago', 'fechaRetencion']

// Códigos de catálogo y demás campos de texto que no son montos ni fechas.
export const CAMPOS_TEXTO: readonly CampoExtraido[] = [
  'rncCedulaContraparte', 'nombreContraparte', 'ncf', 'ncfModificado',
  'tipoBienesServicios', 'tipoRetencionISR', 'formaPago', 'tipoIdentificacion', 'tipoIngreso',
]

export const CAMPOS_MONTO: readonly CampoExtraido[] = CAMPOS_EXTRAIDOS.filter(
  c => !CAMPOS_FECHA.includes(c) && !CAMPOS_TEXTO.includes(c),
)

export const ETIQUETA_CAMPO: Record<CampoExtraido, string> = {
  rncCedulaContraparte: 'RNC / Cédula',
  nombreContraparte: 'Nombre',
  ncf: 'NCF',
  ncfModificado: 'NCF modificado',
  fechaComprobante: 'Fecha del comprobante',
  itbisFacturado: 'ITBIS facturado',
  impuestoSelectivoConsumo: 'Impuesto selectivo al consumo',
  otrosImpuestos: 'Otros impuestos / tasas',
  propinaLegal: 'Propina legal',
  montoTotal: 'Total de la factura',
  tipoBienesServicios: 'Tipo de bienes y servicios',
  fechaPago: 'Fecha de pago',
  montoServicios: 'Monto en servicios',
  montoBienes: 'Monto en bienes',
  itbisRetenido: 'ITBIS retenido',
  itbisProporcionalidad: 'ITBIS sujeto a proporcionalidad',
  itbisLlevadoAlCosto: 'ITBIS llevado al costo',
  tipoRetencionISR: 'Tipo de retención de ISR',
  montoRetencionRenta: 'Monto retención renta',
  formaPago: 'Forma de pago',
  tipoIdentificacion: 'Tipo de identificación',
  tipoIngreso: 'Tipo de ingreso',
  fechaRetencion: 'Fecha de retención',
  montoFacturado: 'Monto facturado',
  itbisRetenidoTerceros: 'ITBIS retenido por terceros',
  retencionRentaTerceros: 'Retención de renta por terceros',
  cobroEfectivo: 'Efectivo',
  cobroCheque: 'Cheque / transferencia / depósito',
  cobroTarjeta: 'Tarjeta débito / crédito',
  cobroCredito: 'Venta a crédito',
  cobroBonos: 'Bonos o certificados de regalo',
  cobroPermuta: 'Permuta',
  cobroOtras: 'Otras formas',
}

// Todos los campos en null: punto de partida de una factura nueva.
export const CAMPOS_VACIOS: CamposDocumento = Object.fromEntries(
  CAMPOS_EXTRAIDOS.map(c => [c, null]),
) as CamposDocumento

// Completa con null los campos que le falten a un registro guardado por una
// versión anterior del modelo (antes de alinear con los formatos 606/607).
export function normalizarDocumento(crudo: DocumentoFiscal): DocumentoFiscal {
  return { ...CAMPOS_VACIOS, ...crudo }
}

// Monto sin impuestos: en compras es servicios + bienes (así lo calcula el
// 606); en ventas es el campo propio.
export function montoFacturadoDe(
  doc: Pick<DocumentoFiscal, 'tipo' | 'montoServicios' | 'montoBienes' | 'montoFacturado'>,
): number | null {
  if (doc.tipo === 'venta') return doc.montoFacturado
  if (doc.montoServicios === null && doc.montoBienes === null) return null
  return (doc.montoServicios ?? 0) + (doc.montoBienes ?? 0)
}

// Todo lo que impide dar la factura por buena, más avisos. Una compra se
// mide contra el Formato 606; una venta, contra las reglas mínimas del
// reporte de ingresos. `rncCliente` es el RNC/cédula del cliente del contador.
export function problemasDeRevision(tipo: TipoDocumento, campos: CamposDocumento, rncCliente: string): Problema[] {
  return tipo === 'compra' ? validarCompra606(campos, rncCliente) : validarVentaIngresos(campos)
}

// Una factura solo puede marcarse 'revisado' si el formato no le objeta nada.
export function puedeMarcarseRevisada(tipo: TipoDocumento, campos: CamposDocumento, rncCliente: string): boolean {
  return problemasDeRevision(tipo, campos, rncCliente).every(p => p.nivel !== 'error')
}

// Único criterio para que una factura entre a un reporte que se va a
// declarar: una persona la revisó y el formato no le objeta nada.
export function esIncluibleEnReporte(doc: DocumentoFiscal, rncCliente: string): boolean {
  return doc.estadoRevision === 'revisado' && puedeMarcarseRevisada(doc.tipo, doc, rncCliente)
}

// Mismo comprobante registrado dos veces para el mismo cliente: mismo tipo,
// mismo NCF y misma contraparte. Se compara sin espacios ni mayúsculas.
export function buscarDuplicado(
  candidato: Pick<DocumentoFiscal, 'id' | 'clienteId' | 'tipo' | 'ncf' | 'rncCedulaContraparte'>,
  existentes: readonly DocumentoFiscal[],
): DocumentoFiscal | undefined {
  const ncf = normalizarNcf(candidato.ncf)
  if (!ncf) return undefined
  const rnc = candidato.rncCedulaContraparte ?? ''
  return existentes.find(d =>
    d.id !== candidato.id &&
    d.estadoRevision !== 'descartado' &&
    d.clienteId === candidato.clienteId &&
    d.tipo === candidato.tipo &&
    normalizarNcf(d.ncf) === ncf &&
    (d.rncCedulaContraparte ?? '') === rnc,
  )
}

export function normalizarNcf(ncf: string | null): string {
  return (ncf ?? '').replace(/\s+/g, '').toUpperCase()
}

// "YYYY-MM" del comprobante, para agrupar por período sin tocar Date.
export function periodoDe(doc: Pick<DocumentoFiscal, 'fechaComprobante'>): string | null {
  return doc.fechaComprobante ? doc.fechaComprobante.slice(0, 7) : null
}

// ─── Clientes ────────────────────────────────────────────────────────────────

export type DatosCliente = Pick<ClienteFiscal, 'tipoPersona' | 'rncCedula' | 'razonSocial' | 'nombreComercial' | 'actividad'>

// Devuelve los errores por campo; objeto vacío = válido.
// Solo se valida la LONGITUD del identificador (RNC de 9 dígitos, cédula de
// 11). El dígito verificador no se comprueba: su algoritmo no se ha
// consultado en una fuente oficial.
export function validarCliente(
  datos: DatosCliente,
  existentes: readonly ClienteFiscal[],
  idPropio?: string,
): Partial<Record<keyof DatosCliente, string>> {
  const errores: Partial<Record<keyof DatosCliente, string>> = {}
  if (!datos.razonSocial.trim()) errores.razonSocial = 'Escribe la razón social o el nombre.'

  const digitos = soloDigitos(datos.rncCedula)
  if (!digitos) {
    errores.rncCedula = 'Escribe el RNC o la cédula.'
  } else if (digitos.length !== 9 && digitos.length !== 11) {
    errores.rncCedula = 'Debe tener 9 dígitos (RNC) u 11 (cédula).'
  } else if (existentes.some(c => c.id !== idPropio && c.rncCedula === digitos)) {
    errores.rncCedula = 'Ya tienes un cliente con ese RNC o cédula.'
  }
  return errores
}
