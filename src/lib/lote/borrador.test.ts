import { describe, expect, it } from 'vitest'
import { documentoDesdePagina, interpretarPagina, type ContextoLote } from './borrador'

const CLIENTE = { id: 'c1', rncCedula: '401007551' }
const qr = (o: { emisor?: string; comprador?: string | null; encf?: string; total?: string } = {}) =>
  `https://ecf.dgii.gov.do/ecf/ConsultaTimbre?RncEmisor=${o.emisor ?? '101123451'}` +
  (o.comprador === null ? '' : `&RncComprador=${o.comprador ?? '401007551'}`) +
  `&ENCF=${o.encf ?? 'E310000007629'}&FechaEmision=01-07-2026&MontoTotal=${o.total ?? '2440.24'}&CodigoSeguridad=x`
const ctx = (cambios: Partial<ContextoLote> = {}): ContextoLote => ({ cliente: CLIENTE, tipoPorDefecto: 'compra', existentes: [], ...cambios })

describe('interpretarPagina', () => {
  it('QR de una compra del cliente: contraparte = emisor, con e-NCF, fecha y total', () => {
    const b = interpretarPagina(qr(), ctx())
    expect(b).toMatchObject({ estado: 'qr', tipo: 'compra' })
    expect(b.campos).toMatchObject({ rncCedulaContraparte: '101123451', ncf: 'E310000007629', fechaComprobante: '2026-07-01', montoTotal: 2440.24 })
    expect(b.campos.itbisFacturado).toBeNull() // el QR no trae subtotal ni ITBIS
  })

  it('QR emitido por el cliente: es una venta, contraparte = comprador', () => {
    const b = interpretarPagina(qr({ emisor: '401007551', comprador: '101123451' }), ctx())
    expect(b).toMatchObject({ estado: 'qr', tipo: 'venta' })
    expect(b.campos).toMatchObject({ rncCedulaContraparte: '101123451', tipoIdentificacion: '1' })
  })

  it('QR sin comprador y de otro emisor: se toma como compra', () => {
    expect(interpretarPagina(qr({ comprador: null }), ctx({ tipoPorDefecto: 'venta' }))).toMatchObject({ estado: 'qr', tipo: 'compra' })
  })

  it('QR de otro comprador y otro emisor: ajena', () => {
    expect(interpretarPagina(qr({ comprador: '130000001' }), ctx()).estado).toBe('ajena')
  })

  it('sin QR, o con un QR que no es de un e-CF: página vacía del tipo por defecto', () => {
    for (const texto of [null, 'https://ejemplo.com/promo', 'texto cualquiera']) {
      const b = interpretarPagina(texto, ctx({ tipoPorDefecto: 'venta' }))
      expect(b).toMatchObject({ estado: 'sin_qr', tipo: 'venta' })
      expect(b.campos.ncf).toBeNull()
    }
  })

  it('duplicada si ya existe la misma factura o se repite en el lote', () => {
    const existente = { id: 'x', clienteId: 'c1', tipo: 'compra' as const, ncf: 'E310000007629', rncCedulaContraparte: '101123451', estadoRevision: 'revisado' as const }
    expect(interpretarPagina(qr(), ctx({ existentes: [existente] })).estado).toBe('duplicada')
    expect(interpretarPagina(qr(), ctx({ existentes: [{ ...existente, clienteId: 'otro' }] })).estado).toBe('qr')
    expect(interpretarPagina(qr({ encf: 'E310000007630' }), ctx({ existentes: [existente] })).estado).toBe('qr')
  })
})

describe('documentoDesdePagina', () => {
  const archivo = { nombre: 'julio.pdf', pagina: 9 }

  it('página con QR: pendiente, origen qr, y lista lo que falta para el 606', () => {
    const doc = documentoDesdePagina('d1', interpretarPagina(qr(), ctx()), CLIENTE, archivo, '2026-08-01T10:00:00.000Z')
    expect(doc).toMatchObject({
      id: 'd1', clienteId: 'c1', tipo: 'compra', origen: 'qr', estadoRevision: 'pendiente_revision',
      archivoNombre: 'julio.pdf', archivoPagina: 9, archivoMimeType: 'image/jpeg', ncf: 'E310000007629', confianzaOCR: 1,
    })
    expect(doc.camposIncompletos).toEqual(['itbisFacturado', 'tipoBienesServicios', 'montoServicios'])
  })

  it('página sin QR: pendiente vacía, origen manual', () => {
    const doc = documentoDesdePagina('d2', interpretarPagina(null, ctx()), CLIENTE, archivo, '2026-08-01T10:00:00.000Z')
    expect(doc).toMatchObject({ origen: 'manual', ncf: null, confianzaOCR: 0, estadoRevision: 'pendiente_revision' })
    expect(doc.camposIncompletos).toContain('ncf')
  })
})
