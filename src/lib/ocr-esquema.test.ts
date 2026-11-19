import { describe, expect, it } from 'vitest'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { LecturaSchema, MAXIMO_OPCIONALES, MAXIMO_UNIONES, lecturaDesdeModelo, type LecturaCruda } from './ocr-esquema'

type Nodo = { type?: unknown; anyOf?: unknown; properties?: Record<string, Nodo>; required?: string[]; items?: Nodo }

// Cuenta, en todo el esquema que el SDK envía a la API, los parámetros con
// tipo unión y los opcionales (los límites de complejidad de Anthropic).
function contar(nodo: Nodo, acc = { uniones: 0, opcionales: 0 }) {
  for (const [nombre, hijo] of Object.entries(nodo.properties ?? {})) {
    if (Array.isArray(hijo.type) || Array.isArray(hijo.anyOf)) acc.uniones++
    if (!(nodo.required ?? []).includes(nombre)) acc.opcionales++
    contar(hijo, acc)
  }
  if (nodo.items) contar(nodo.items, acc)
  return acc
}

const VACIA: LecturaCruda = {
  esComprobanteFiscal: true, rncEmisor: '', nombreEmisor: '', rncComprador: '', nombreComprador: '',
  ncf: '', ncfModificado: '', fechaComprobante: '', fechaPago: '',
  montoSinImpuestos: null, montoServicios: null, montoBienes: null, itbisFacturado: null,
  impuestoSelectivoConsumo: null, otrosImpuestos: null, propinaLegal: null, montoTotal: null,
  formaPago: '', tipoBienesServicios: '', camposDudosos: [], confianza: 0.5,
}

describe('esquema de la lectura de la IA', () => {
  it('cabe en los límites de complejidad de la API (16 uniones, 24 opcionales)', () => {
    const { schema } = betaZodOutputFormat(LecturaSchema) as unknown as { schema: Nodo }
    const { uniones, opcionales } = contar(schema)
    expect(uniones).toBeLessThanOrEqual(MAXIMO_UNIONES)
    expect(opcionales).toBeLessThanOrEqual(MAXIMO_OPCIONALES)
    expect(uniones).toBe(8) // solo los montos
  })

  it('el catálogo admite cadena vacía como "no aparece"', () => {
    expect(LecturaSchema.safeParse(VACIA).success).toBe(true)
    expect(LecturaSchema.safeParse({ ...VACIA, formaPago: '99' }).success).toBe(false)
  })

  it('convierte las cadenas vacías (o solo espacios) en null y conserva el resto', () => {
    const l = lecturaDesdeModelo({ ...VACIA, ncf: ' E310000000123 ', nombreEmisor: '  ', formaPago: '01', montoTotal: 0 })
    expect(l.ncf).toBe('E310000000123')
    expect(l.nombreEmisor).toBeNull()
    expect(l.rncEmisor).toBeNull()
    expect(l.fechaComprobante).toBeNull()
    expect(l.formaPago).toBe('01')
    expect(l.tipoBienesServicios).toBeNull()
    expect(l.montoTotal).toBe(0)
    expect(l.montoSinImpuestos).toBeNull()
  })
})
