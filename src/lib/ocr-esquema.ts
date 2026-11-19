import { z } from 'zod'
import { FORMA_PAGO_606, TIPO_BIENES_SERVICIOS_606 } from '@/lib/dgii-formatos'
import { CAMPOS_MODELO, type LecturaModelo } from '@/lib/ocr-interpretar'

// Esquema de la salida estructurada de la IA (`POST /api/ocr`).
//
// Límite de la API (documentación de Anthropic, "Schema complexity limits",
// consultada el 2026-11-19): como máximo 16 parámetros con tipo unión
// (`anyOf` o `"type": [..., "null"]`) y 24 opcionales en total. Cada
// `.nullable()` cuenta como unión. Con los 18 campos nulables de antes la API
// respondía 400 a TODAS las lecturas. Por eso los textos y los catálogos no
// son nulables: el dato faltante viaja como cadena vacía y `lecturaDesdeModelo`
// lo vuelve null. Solo los montos siguen siendo nulables (8 uniones), porque
// un 0 es un dato válido y no puede significar "no aparece".
// Sin restricciones numéricas: los rangos se validan en `interpretarLectura`.

export const MAXIMO_UNIONES = 16
export const MAXIMO_OPCIONALES = 24

const CODIGOS_FORMA_PAGO = FORMA_PAGO_606.map(o => o.codigo)
const CODIGOS_TIPO_BIENES = TIPO_BIENES_SERVICIOS_606.map(o => o.codigo)

export const LecturaSchema = z.object({
  esComprobanteFiscal: z.boolean(),
  rncEmisor: z.string(),
  nombreEmisor: z.string(),
  rncComprador: z.string(),
  nombreComprador: z.string(),
  ncf: z.string(),
  ncfModificado: z.string(),
  fechaComprobante: z.string(),
  fechaPago: z.string(),
  montoSinImpuestos: z.number().nullable(),
  montoServicios: z.number().nullable(),
  montoBienes: z.number().nullable(),
  itbisFacturado: z.number().nullable(),
  impuestoSelectivoConsumo: z.number().nullable(),
  otrosImpuestos: z.number().nullable(),
  propinaLegal: z.number().nullable(),
  montoTotal: z.number().nullable(),
  formaPago: z.enum(['', ...CODIGOS_FORMA_PAGO] as [string, ...string[]]),
  tipoBienesServicios: z.enum(['', ...CODIGOS_TIPO_BIENES] as [string, ...string[]]),
  camposDudosos: z.array(z.enum(CAMPOS_MODELO)),
  confianza: z.number(),
})

export type LecturaCruda = z.infer<typeof LecturaSchema>

const texto = (v: string): string | null => (v.trim() === '' ? null : v.trim())

// De la salida del modelo (cadena vacía = no aparece) a `LecturaModelo` (null).
export function lecturaDesdeModelo(c: LecturaCruda): LecturaModelo {
  return {
    ...c,
    rncEmisor: texto(c.rncEmisor),
    nombreEmisor: texto(c.nombreEmisor),
    rncComprador: texto(c.rncComprador),
    nombreComprador: texto(c.nombreComprador),
    ncf: texto(c.ncf),
    ncfModificado: texto(c.ncfModificado),
    fechaComprobante: texto(c.fechaComprobante),
    fechaPago: texto(c.fechaPago),
    formaPago: texto(c.formaPago),
    tipoBienesServicios: texto(c.tipoBienesServicios),
  }
}
