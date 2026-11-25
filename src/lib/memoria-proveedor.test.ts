import { describe, expect, it } from 'vitest'
import { CAMPOS_VACIOS } from './documentos'
import { aplicarCategoriaRecordada, categoriaRecordada } from './memoria-proveedor'
import type { ResultadoOCR } from './ocr-tipos'

const doc = (rnc: string, tipoBienes: string, dia: number, cambios = {}) => ({
  tipo: 'compra' as const, estadoRevision: 'revisado' as const, rncCedulaContraparte: rnc, tipoBienesServicios: tipoBienes,
  revisadoEn: `2026-11-${String(dia).padStart(2, '0')}T10:00:00Z`, actualizadoEn: `2026-11-${String(dia).padStart(2, '0')}T10:00:00Z`, ...cambios,
})

describe('categoriaRecordada', () => {
  it('si las revisadas del proveedor coinciden, la recuerda (con o sin guiones en el RNC)', () => {
    const docs = [doc('101123451', '09', 1), doc('101123451', '09', 5), doc('130000001', '02', 3)]
    expect(categoriaRecordada(docs, '1-01-12345-1')).toBe('09')
    expect(categoriaRecordada(docs, '130000001')).toBe('02')
  })

  it('si no coinciden, no recuerda nada (decide la IA)', () => {
    expect(categoriaRecordada([doc('101123451', '09', 1), doc('101123451', '02', 2)], '101123451')).toBeNull()
  })

  it('solo mira las 5 revisadas más recientes', () => {
    const docs = [doc('101123451', '02', 1), ...[2, 3, 4, 5, 6].map(d => doc('101123451', '09', d))]
    expect(categoriaRecordada(docs, '101123451')).toBe('09')
  })

  it('no cuenta pendientes, ventas, sin categoría ni otro proveedor', () => {
    const docs = [
      doc('101123451', '09', 1, { estadoRevision: 'pendiente_revision' }),
      doc('101123451', '09', 2, { tipo: 'venta' }),
      doc('101123451', '', 3),
      doc('130000001', '09', 4),
    ]
    expect(categoriaRecordada(docs, '101123451')).toBeNull()
    expect(categoriaRecordada(docs, null)).toBeNull()
    expect(categoriaRecordada(docs, '123')).toBeNull()
  })
})

describe('aplicarCategoriaRecordada', () => {
  const lectura = (cambios: Partial<ResultadoOCR> = {}): ResultadoOCR => ({
    esComprobante: true, tipo: 'compra', coincideCliente: true, confianzaOCR: 0.8,
    extraccion: { ...CAMPOS_VACIOS, tipoBienesServicios: '02' }, camposDudosos: ['tipoBienesServicios', 'montoBienes'], ...cambios,
  })

  it('pone la categoría y la quita de las dudas, sin tocar las demás dudas', () => {
    const r = aplicarCategoriaRecordada(lectura(), '09')
    expect(r.extraccion.tipoBienesServicios).toBe('09')
    expect(r.camposDudosos).toEqual(['montoBienes'])
  })

  it('sin categoría recordada, en ventas o si no es factura, no cambia nada', () => {
    const l = lectura()
    expect(aplicarCategoriaRecordada(l, null)).toBe(l)
    const venta = lectura({ tipo: 'venta' })
    expect(aplicarCategoriaRecordada(venta, '09')).toBe(venta)
    const noEs = lectura({ esComprobante: false })
    expect(aplicarCategoriaRecordada(noEs, '09')).toBe(noEs)
  })
})
