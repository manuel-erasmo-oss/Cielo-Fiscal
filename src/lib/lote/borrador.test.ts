import { describe, expect, it } from 'vitest'
import { CAMPOS_VACIOS } from '@/lib/documentos'
import type { ResultadoOCR } from '@/lib/ocr-tipos'
import { documentoDesdePagina, fusionarConLectura, interpretarPagina, observaciones, type ContextoLote } from './borrador'

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
    expect(doc.origen).toBe('qr')
  })

  it('página sin QR: pendiente vacía, origen manual', () => {
    const doc = documentoDesdePagina('d2', interpretarPagina(null, ctx()), CLIENTE, archivo, '2026-08-01T10:00:00.000Z')
    expect(doc).toMatchObject({ origen: 'manual', ncf: null, confianzaOCR: 0, estadoRevision: 'pendiente_revision' })
    expect(doc.camposIncompletos).toContain('ncf')
  })
})

describe('fusionarConLectura', () => {
  const lectura = (cambios: Partial<ResultadoOCR> = {}, campos: Partial<ResultadoOCR['extraccion']> = {}): ResultadoOCR => ({
    esComprobante: true, tipo: 'compra', coincideCliente: true, confianzaOCR: 0.9, camposDudosos: [],
    extraccion: {
      ...CAMPOS_VACIOS, rncCedulaContraparte: '101123451', nombreContraparte: 'Ferretería El Sol SRL', ncf: 'E310000007629',
      fechaComprobante: '2026-07-01', montoServicios: 0, montoBienes: 2068, itbisFacturado: 372.24, montoTotal: 2440.24,
      tipoBienesServicios: '09', ...campos,
    },
    ...cambios,
  })

  it('página con QR + IA: completa montos y categoría; queda lista', () => {
    const b = fusionarConLectura(interpretarPagina(qr(), ctx()), lectura(), ctx())
    expect(b).toMatchObject({ estado: 'qr', tipo: 'compra', leidaConIA: true, dudosos: [] })
    expect(b.campos).toMatchObject({ ncf: 'E310000007629', montoBienes: 2068, itbisFacturado: 372.24, tipoBienesServicios: '09', nombreContraparte: 'Ferretería El Sol SRL' })
    expect(observaciones(b, CLIENTE.rncCedula)).toEqual([])
  })

  it('lo del QR manda sobre lo que leyó la IA, y deja de estar en duda', () => {
    const mal = lectura({ camposDudosos: ['ncf', 'rncCedulaContraparte', 'tipoBienesServicios'] }, { rncCedulaContraparte: '101123459', ncf: 'E310000007620', fechaComprobante: '2026-07-10', montoTotal: 2440.24 })
    const b = fusionarConLectura(interpretarPagina(qr(), ctx()), mal, ctx())
    expect(b.campos).toMatchObject({ rncCedulaContraparte: '101123451', ncf: 'E310000007629', fechaComprobante: '2026-07-01' })
    expect(b.dudosos).toEqual(['tipoBienesServicios'])
  })

  it('si los montos de la IA no suman el total del QR, quedan para revisar', () => {
    const b = fusionarConLectura(interpretarPagina(qr(), ctx()), lectura({}, { montoBienes: 2008 }), ctx())
    expect(b.dudosos).toEqual(['itbisFacturado', 'montoServicios', 'montoBienes'])
    expect(observaciones(b, CLIENTE.rncCedula)).not.toEqual([])
  })

  it('si la IA entendió compra por venta, se conserva solo lo del QR', () => {
    const b = fusionarConLectura(interpretarPagina(qr(), ctx()), lectura({ tipo: 'venta' }), ctx())
    expect(b.campos.montoBienes).toBeNull()
    expect(b.campos.ncf).toBe('E310000007629')
    expect(b.nota).toMatch(/no coincidió/)
  })

  it('página sin QR: la IA aporta todo, incluido si es compra o venta', () => {
    const b = fusionarConLectura(interpretarPagina(null, ctx()), lectura({ tipo: 'venta' }, { montoFacturado: 2068, montoBienes: null, montoServicios: null }), ctx())
    expect(b).toMatchObject({ estado: 'sin_qr', tipo: 'venta', leidaConIA: true })
    expect(observaciones(b, CLIENTE.rncCedula)).toEqual([])
  })

  it('página sin QR que no es factura: se marca y no trae datos', () => {
    const b = fusionarConLectura(interpretarPagina(null, ctx()), lectura({ esComprobante: false, extraccion: { ...CAMPOS_VACIOS } }), ctx())
    expect(b.estado).toBe('no_factura')
  })

  it('página sin QR: detecta duplicados con el NCF que leyó la IA, y avisa si el cliente no aparece', () => {
    const existente = { id: 'x', clienteId: 'c1', tipo: 'compra' as const, ncf: 'E310000007629', rncCedulaContraparte: '101123451', estadoRevision: 'revisado' as const }
    expect(fusionarConLectura(interpretarPagina(null, ctx()), lectura(), ctx({ existentes: [existente] })).estado).toBe('duplicada')
    expect(fusionarConLectura(interpretarPagina(null, ctx()), lectura({ coincideCliente: false }), ctx()).nota).toMatch(/no aparece/)
  })

  it('una página leída con IA se guarda con origen ocr y sus observaciones', () => {
    const b = fusionarConLectura(interpretarPagina(qr(), ctx()), lectura({ camposDudosos: ['tipoBienesServicios'] }), ctx())
    const doc = documentoDesdePagina('d9', b, CLIENTE, { nombre: 'julio.pdf', pagina: 9 }, '2026-08-01T10:00:00.000Z')
    expect(doc).toMatchObject({ origen: 'ocr', confianzaOCR: 0.9, estadoRevision: 'pendiente_revision', camposIncompletos: ['tipoBienesServicios'] })
  })
})
