import { describe, expect, it } from 'vitest'
import { interpretarLectura, type LecturaModelo } from './ocr-interpretar'

const CLIENTE = '401007551'
function lectura(cambios: Partial<LecturaModelo> = {}): LecturaModelo {
  return {
    esComprobanteFiscal: true,
    rncEmisor: '101-12345-1', nombreEmisor: ' Ferretería El Sol SRL ', rncComprador: '401007551', nombreComprador: 'Comercial Quisqueya SRL',
    ncf: 'e31 0000007629', ncfModificado: null, fechaComprobante: '2026-07-01', fechaPago: null,
    montoSinImpuestos: 2068, montoServicios: 0, montoBienes: 2068, itbisFacturado: 372.24, impuestoSelectivoConsumo: null,
    otrosImpuestos: null, propinaLegal: null, montoTotal: 2440.24, formaPago: null, tipoBienesServicios: '09',
    camposDudosos: [], confianza: 0.93,
    ...cambios,
  }
}
const ctx = (rncCliente: string | null = CLIENTE, tipoPorDefecto: 'compra' | 'venta' = 'compra') => ({ rncCliente, tipoPorDefecto })

describe('interpretarLectura', () => {
  it('el cliente es el comprador: compra, la contraparte es el emisor', () => {
    const r = interpretarLectura(lectura(), ctx(CLIENTE, 'venta'))
    expect(r).toMatchObject({ esComprobante: true, tipo: 'compra', coincideCliente: true, confianzaOCR: 0.93, camposDudosos: [] })
    expect(r.extraccion).toMatchObject({
      rncCedulaContraparte: '101123451', nombreContraparte: 'Ferretería El Sol SRL', ncf: 'E310000007629',
      montoServicios: 0, montoBienes: 2068, itbisFacturado: 372.24, montoTotal: 2440.24, tipoBienesServicios: '09', montoFacturado: null,
    })
  })

  it('el cliente es el emisor: venta, la contraparte es el comprador y no lleva categoría de compra', () => {
    const r = interpretarLectura(lectura({ rncEmisor: CLIENTE, rncComprador: '101123451', nombreComprador: 'Cliente SRL' }), ctx())
    expect(r).toMatchObject({ tipo: 'venta', coincideCliente: true })
    expect(r.extraccion).toMatchObject({ rncCedulaContraparte: '101123451', nombreContraparte: 'Cliente SRL', tipoIdentificacion: '1', montoFacturado: 2068, montoBienes: null, tipoBienesServicios: null })
  })

  it('comprobante de compras (E41) emitido por el cliente: es una compra y la contraparte es el vendedor', () => {
    const r = interpretarLectura(lectura({
      ncf: 'E410000000003', rncEmisor: CLIENTE, nombreEmisor: 'Comercial Quisqueya SRL', rncComprador: '00112345673', nombreComprador: 'Juan Pérez',
    }), ctx(CLIENTE, 'venta'))
    expect(r).toMatchObject({ tipo: 'compra', coincideCliente: true })
    expect(r.extraccion).toMatchObject({ rncCedulaContraparte: '00112345673', nombreContraparte: 'Juan Pérez', montoBienes: 2068, montoFacturado: null })
  })

  it('gastos menores (B13/E43) emitidos por el cliente: compra con el RNC del propio cliente', () => {
    for (const ncf of ['B1300000004', 'E430000000004']) {
      const r = interpretarLectura(lectura({ ncf, rncEmisor: CLIENTE, rncComprador: null, nombreComprador: null }), ctx(CLIENTE, 'venta'))
      expect(r, ncf).toMatchObject({ tipo: 'compra', coincideCliente: true })
      expect(r.extraccion.rncCedulaContraparte, ncf).toBe(CLIENTE)
    }
  })

  it('ninguno de los dos RNC es el del cliente: usa el tipo por defecto y deja la contraparte en duda', () => {
    const r = interpretarLectura(lectura({ rncComprador: '130000001' }), ctx(CLIENTE, 'compra'))
    expect(r).toMatchObject({ tipo: 'compra', coincideCliente: false })
    expect(r.camposDudosos).toContain('rncCedulaContraparte')
  })

  it('sin comprador impreso o sin RNC de cliente: no se puede comprobar', () => {
    expect(interpretarLectura(lectura({ rncComprador: null }), ctx()).coincideCliente).toBeNull()
    expect(interpretarLectura(lectura(), ctx(null, 'venta'))).toMatchObject({ tipo: 'venta', coincideCliente: null })
  })

  it('no es un comprobante: sin datos', () => {
    const r = interpretarLectura(lectura({ esComprobanteFiscal: false }), ctx())
    expect(r.esComprobante).toBe(false)
    expect(r.extraccion.ncf).toBeNull()
    expect(r.camposDudosos).toEqual([])
  })

  it('valores que no pasan validación quedan en null y en duda', () => {
    const r = interpretarLectura(lectura({ fechaComprobante: '2026-02-30', itbisFacturado: -5 }), ctx())
    expect(r.extraccion).toMatchObject({ fechaComprobante: null, itbisFacturado: null })
    expect(r.camposDudosos).toEqual(expect.arrayContaining(['fechaComprobante', 'itbisFacturado']))
  })

  it('el reparto bienes/servicios que no suma el subtotal queda en duda', () => {
    const r = interpretarLectura(lectura({ montoBienes: 1000 }), ctx())
    expect(r.camposDudosos).toEqual(expect.arrayContaining(['montoServicios', 'montoBienes']))
  })

  it('las dudas del modelo se traducen al campo de la factura', () => {
    const r = interpretarLectura(lectura({ camposDudosos: ['rncEmisor', 'rncComprador', 'tipoBienesServicios', 'montoTotal'] }), ctx())
    // En una compra la contraparte es el emisor: la duda sobre el comprador no aplica.
    expect(r.camposDudosos).toEqual(['rncCedulaContraparte', 'montoTotal', 'tipoBienesServicios'])
  })

  it('la confianza se acota a 0..1', () => {
    expect(interpretarLectura(lectura({ confianza: 7 }), ctx()).confianzaOCR).toBe(1)
    expect(interpretarLectura(lectura({ confianza: NaN }), ctx()).confianzaOCR).toBe(0)
  })
})
