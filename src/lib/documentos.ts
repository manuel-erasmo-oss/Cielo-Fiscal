import { soloDigitos } from '@/lib/utils'
import type { CampoExtraido, ClienteFiscal, DocumentoFiscal } from '@/types'

// Lógica pura sobre clientes y facturas: sin React, sin almacenamiento. Todo
// lo que decide si un dato puede entrar a un reporte vive aquí, para que la
// regla sea la misma la aplique la pantalla, el OCR o (más adelante) el
// servidor.

export const CAMPOS_EXTRAIDOS = [
  'rncCedulaContraparte',
  'nombreContraparte',
  'ncf',
  'ncfModificado',
  'fechaComprobante',
  'fechaPago',
  'montoFacturado',
  'itbisFacturado',
  'montoTotal',
] as const satisfies readonly CampoExtraido[]

// Campos sin los cuales una factura no puede darse por revisada. Los otros
// dos (ncfModificado, fechaPago) son legítimamente vacíos en muchas facturas.
export const CAMPOS_REQUERIDOS: readonly CampoExtraido[] = [
  'rncCedulaContraparte',
  'nombreContraparte',
  'ncf',
  'fechaComprobante',
  'montoFacturado',
  'itbisFacturado',
  'montoTotal',
]

export const ETIQUETA_CAMPO: Record<CampoExtraido, string> = {
  rncCedulaContraparte: 'RNC / Cédula',
  nombreContraparte: 'Nombre',
  ncf: 'NCF',
  ncfModificado: 'NCF modificado',
  fechaComprobante: 'Fecha del comprobante',
  fechaPago: 'Fecha de pago',
  montoFacturado: 'Monto facturado',
  itbisFacturado: 'ITBIS facturado',
  montoTotal: 'Monto total',
}

export type CamposDocumento = Pick<DocumentoFiscal, CampoExtraido>

// Campos requeridos que siguen vacíos.
export function camposRequeridosFaltantes(campos: CamposDocumento): CampoExtraido[] {
  return CAMPOS_REQUERIDOS.filter(c => campos[c] === null || campos[c] === '')
}

// Una factura solo puede marcarse 'revisado' con todos los requeridos llenos.
export function puedeMarcarseRevisada(campos: CamposDocumento): boolean {
  return camposRequeridosFaltantes(campos).length === 0
}

// Único criterio para que una factura entre a un reporte que se va a
// declarar: una persona la revisó y no le falta ningún campo requerido.
export function esIncluibleEnReporte(doc: DocumentoFiscal): boolean {
  return doc.estadoRevision === 'revisado' && puedeMarcarseRevisada(doc)
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

export type DatosCliente = Pick<ClienteFiscal, 'tipoPersona' | 'rncCedula' | 'razonSocial' | 'nombreComercial'>

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
