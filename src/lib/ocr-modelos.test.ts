import { describe, expect, it } from 'vitest'
import { CAMPOS_VACIOS } from './documentos'
import { aciertosContraQr, compararLecturas, costoUSD, modeloOCR, MODELO_OCR_POR_DEFECTO } from './ocr-modelos'
import type { ResultadoOCR } from './ocr-tipos'

function lectura(cambios: Partial<ResultadoOCR['extraccion']> = {}, resto: Partial<ResultadoOCR> = {}): ResultadoOCR {
  return {
    esComprobante: true, tipo: 'compra', coincideCliente: true, confianzaOCR: 0.9, camposDudosos: [],
    extraccion: { ...CAMPOS_VACIOS, ncf: 'E310000000123', rncCedulaContraparte: '101010101', fechaComprobante: '2026-08-14', montoTotal: 1180, ...cambios },
    ...resto,
  }
}

describe('modelos y costo', () => {
  it('el modelo por defecto está en la lista y uno desconocido no', () => {
    expect(modeloOCR(MODELO_OCR_POR_DEFECTO)?.nombre).toBe('Modelo principal')
    expect(modeloOCR('gpt-4')).toBeNull()
    expect(modeloOCR(undefined)).toBeNull()
  })

  it('calcula el costo con los precios por millón de tokens', () => {
    // Avanzado (US$4/US$20): 4,500 de entrada × $4 + 1,500 de salida × $20 = $0.018 + $0.03
    expect(costoUSD({ modelo: 'avanzado', tokensEntrada: 4500, tokensSalida: 1500 })).toBeCloseTo(0.048, 6)
    expect(costoUSD({ modelo: 'principal', tokensEntrada: 4500, tokensSalida: 1500 })).toBeCloseTo(0.0012, 6)
    expect(costoUSD({ modelo: 'otro', tokensEntrada: 1, tokensSalida: 1 })).toBeNull()
    // Caché: 2,000 leídos cuestan como 200 de entrada; 2,000 escritos como 2,500.
    expect(costoUSD({ modelo: 'relectura', tokensEntrada: 0, tokensSalida: 0, tokensCacheLeidos: 2000 })).toBeCloseTo(0.0004, 6)
    expect(costoUSD({ modelo: 'relectura', tokensEntrada: 0, tokensSalida: 0, tokensCacheEscritos: 2000 })).toBeCloseTo(0.005, 6)
  })
})

describe('compararLecturas', () => {
  it('iguales salvo formato: sin diferencias', () => {
    const r = compararLecturas(lectura(), lectura({ ncf: ' e31-0000000123 ', montoTotal: 1180.001 }))
    expect(r.diferencias).toEqual([])
    expect(r.comparados).toBe(6) // esComprobante, tipo y los 4 campos leídos
  })

  it('lista solo los campos que difieren y no cuenta los que ninguno leyó', () => {
    const r = compararLecturas(lectura(), lectura({ rncCedulaContraparte: '101010107', itbisFacturado: 180 }, { tipo: 'venta' }))
    expect(r.diferencias.map(d => d.campo).sort()).toEqual(['itbisFacturado', 'rncCedulaContraparte', 'tipo'])
    expect(r.diferencias.find(d => d.campo === 'itbisFacturado')).toEqual({ campo: 'itbisFacturado', a: '—', b: '180.00' })
    expect(r.comparados).toBe(7)
  })
})

describe('aciertosContraQr', () => {
  const qr = { rncEmisor: '101010101', rncComprador: '401007551', encf: 'E310000000123', fechaEmision: '2026-08-14', montoTotal: 1180 }

  it('cuenta NCF, fecha, total y RNC de la contraparte', () => {
    expect(aciertosContraQr(lectura(), qr, '401-00755-1')).toEqual({ aciertos: 4, total: 4, fallos: [] })
  })

  it('marca lo que no coincide con lo que firmó el emisor', () => {
    const r = aciertosContraQr(lectura({ ncf: 'E310000000128', montoTotal: null }), qr, '401007551')
    expect(r).toEqual({ aciertos: 2, total: 4, fallos: ['ncf', 'montoTotal'] })
  })

  it('en una venta la contraparte es el comprador; sin comprador no se cuenta', () => {
    const venta = { ...qr, rncEmisor: '401007551', rncComprador: null }
    expect(aciertosContraQr(lectura(), venta, '401007551').total).toBe(3)
  })
})
