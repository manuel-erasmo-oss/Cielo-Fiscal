import { describe, expect, it } from 'vitest'
import { CAMPOS_VACIOS } from '@/lib/documentos'
import type { ResultadoOCR } from '@/lib/ocr-tipos'
import { aplicarVerificacion, conDatosDGII, documentoDesdePagina, fusionarConLectura, interpretarPagina, observaciones, type ContextoLote } from './borrador'

const CLIENTE = { id: 'c1', rncCedula: '401007551' }
const qr = (o: { emisor?: string; comprador?: string | null; encf?: string; total?: string } = {}) =>
  `https://ecf.dgii.gov.do/ecf/ConsultaTimbre?RncEmisor=${o.emisor ?? '101123451'}` +
  (o.comprador === null ? '' : `&RncComprador=${o.comprador ?? '401007551'}`) +
  `&ENCF=${o.encf ?? 'E310000007629'}&FechaEmision=01-07-2026&MontoTotal=${o.total ?? '2440.24'}&CodigoSeguridad=x`
const ctx = (cambios: Partial<ContextoLote> = {}): ContextoLote => ({ cliente: CLIENTE, tipoPorDefecto: 'compra', existentes: [], ...cambios })

describe('cada módulo, solo su tipo (decisión del usuario, 2026-11-19)', () => {
  const lect = (cambios: Partial<ResultadoOCR> = {}, campos: Partial<ResultadoOCR['extraccion']> = {}): ResultadoOCR => ({
    esComprobante: true, tipo: 'compra', coincideCliente: true, confianzaOCR: 0.9, camposDudosos: [],
    extraccion: { ...CAMPOS_VACIOS, rncCedulaContraparte: '101123451', ncf: 'B0100000123', fechaComprobante: '2026-07-01', montoServicios: 0, montoBienes: 1000, itbisFacturado: 180, montoTotal: 1180, tipoBienesServicios: '09', ...campos },
    ...cambios,
  })

  it('QR de una compra subida en Ingresos: se descarta (otro_modulo), no se puede incluir', () => {
    const b = interpretarPagina(qr(), ctx({ tipoPorDefecto: 'venta', tipoModulo: 'venta' }))
    expect(b).toMatchObject({ estado: 'otro_modulo', tipo: 'compra' })
    expect(b.nota).toMatch(/en Ingresos solo se registran ventas/)
    // La IA ya no la toca.
    expect(fusionarConLectura(b, lect(), ctx({ tipoModulo: 'venta' })).estado).toBe('otro_modulo')
  })

  it('QR de una venta subida en Costos y gastos: se descarta', () => {
    const b = interpretarPagina(qr({ emisor: '401007551', comprador: '101123451' }), ctx({ tipoModulo: 'compra' }))
    expect(b).toMatchObject({ estado: 'otro_modulo', tipo: 'venta' })
    expect(b.nota).toMatch(/en Costos y gastos solo se registran compras/)
  })

  it('sin QR, la IA dice que es del otro tipo: se descarta', () => {
    const b = fusionarConLectura(interpretarPagina(null, ctx({ tipoPorDefecto: 'venta' })), lect({ tipo: 'compra' }), ctx({ tipoPorDefecto: 'venta', tipoModulo: 'venta' }))
    expect(b.estado).toBe('otro_modulo')
  })

  it('venta que la IA no pudo confirmar como emitida por la empresa: el NCF queda para revisión', () => {
    const venta = lect({ tipo: 'venta', coincideCliente: null }, { ncf: 'B0200000001', rncCedulaContraparte: null, montoBienes: null, montoServicios: null, montoFacturado: 1000, tipoBienesServicios: null })
    const b = fusionarConLectura(interpretarPagina(null, ctx({ tipoPorDefecto: 'venta' })), venta, ctx({ tipoPorDefecto: 'venta', tipoModulo: 'venta' }))
    expect(b.estado).toBe('sin_qr')
    expect(b.nota).toMatch(/emitió esta empresa/)
    expect(b.dudosos).toContain('ncf')
  })

  it('venta sin cliente: con B02 no hay observación del cliente; con B01, sí (no es consumidor final)', () => {
    const base = { tipo: 'venta' as const, coincideCliente: true }
    const campos = { rncCedulaContraparte: null, montoBienes: null, montoServicios: null, montoFacturado: 1000, tipoBienesServicios: null }
    const consumo = fusionarConLectura(interpretarPagina(null, ctx({ tipoPorDefecto: 'venta' })), lect(base, { ...campos, ncf: 'B0200000001' }), ctx({ tipoPorDefecto: 'venta' }))
    const credito = fusionarConLectura(interpretarPagina(null, ctx({ tipoPorDefecto: 'venta' })), lect(base, { ...campos, ncf: 'B0100000001' }), ctx({ tipoPorDefecto: 'venta' }))
    expect(observaciones(consumo, CLIENTE.rncCedula)).not.toContain('rncCedulaContraparte')
    expect(observaciones(credito, CLIENTE.rncCedula)).toContain('rncCedulaContraparte')
  })
})

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

  it('QR de un e-CF de compras (E41) emitido por el cliente: compra, contraparte = el vendedor', () => {
    const b = interpretarPagina(qr({ emisor: '401007551', comprador: '00112345673', encf: 'E410000000001' }), ctx({ tipoPorDefecto: 'venta' }))
    expect(b).toMatchObject({ estado: 'qr', tipo: 'compra' })
    expect(b.campos.rncCedulaContraparte).toBe('00112345673')
  })

  it('QR de gastos menores (E43) emitido por el cliente: compra con el RNC del cliente', () => {
    const b = interpretarPagina(qr({ emisor: '401007551', comprador: null, encf: 'E430000000001' }), ctx({ tipoPorDefecto: 'venta' }))
    expect(b).toMatchObject({ estado: 'qr', tipo: 'compra' })
    expect(b.campos.rncCedulaContraparte).toBe('401007551')
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
    // 'ncf': factura electrónica todavía sin verificar en la DGII.
    expect(doc.camposIncompletos).toEqual(['ncf', 'itbisFacturado', 'tipoBienesServicios', 'montoServicios'])
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

  it('página con QR + IA: completa montos y categoría; queda lista al verificarse en la DGII', () => {
    const b = fusionarConLectura(interpretarPagina(qr(), ctx()), lectura(), ctx())
    expect(b).toMatchObject({ estado: 'qr', tipo: 'compra', leidaConIA: true, dudosos: [] })
    expect(b.campos).toMatchObject({ ncf: 'E310000007629', montoBienes: 2068, itbisFacturado: 372.24, tipoBienesServicios: '09', nombreContraparte: 'Ferretería El Sol SRL' })
    expect(observaciones(b, CLIENTE.rncCedula)).toEqual(['ncf'])
    const aceptada = aplicarVerificacion(b, { estado: 'aceptado', texto: 'Aceptado', datos: null }, '2026-11-18T12:00:00.000Z')
    expect(observaciones(aceptada, CLIENTE.rncCedula)).toEqual([])
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
    // e-CF cuyo QR no se leyó: lo verifica una persona (decisión del usuario).
    expect(observaciones(b, CLIENTE.rncCedula)).toEqual(['ncf'])
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
    expect(doc).toMatchObject({ origen: 'ocr', confianzaOCR: 0.9, estadoRevision: 'pendiente_revision', camposIncompletos: ['ncf', 'tipoBienesServicios'] })
  })
})

describe('verificación en la DGII', () => {
  const lectura = (campos: Partial<ResultadoOCR['extraccion']> = {}, dudosos: ResultadoOCR['camposDudosos'] = []): ResultadoOCR => ({
    esComprobante: true, tipo: 'compra', coincideCliente: true, confianzaOCR: 0.9, camposDudosos: dudosos,
    extraccion: {
      ...CAMPOS_VACIOS, rncCedulaContraparte: '101123451', nombreContraparte: null, ncf: 'E310000007629',
      fechaComprobante: '2026-07-01', montoServicios: 0, montoBienes: 2068, itbisFacturado: 300, montoTotal: 2440.24,
      tipoBienesServicios: '09', ...campos,
    },
  })
  const respuesta = (estado: 'aceptado' | 'rechazado' | 'no_encontrado', itbis: number | null = 372.24) => ({
    estado, texto: estado,
    datos: estado === 'no_encontrado' ? null : {
      rncEmisor: '101123451', razonSocialEmisor: 'FERRETERIA EL SOL SRL', rncComprador: '401007551', razonSocialComprador: 'CLIENTE SRL',
      encf: 'E310000007629', totalItbis: itbis, montoTotal: 2440.24,
    },
  })
  const AHORA = '2026-11-18T12:00:00.000Z'

  it('la página con QR de un e-CF guarda su dirección de consulta', () => {
    expect(interpretarPagina(qr(), ctx()).qrUrl).toMatch(/^https:\/\/ecf\.dgii\.gov\.do\//)
  })

  it('aceptada: el ITBIS de la DGII deja de estar en duda y la razón social llena el nombre', () => {
    const leida = fusionarConLectura(interpretarPagina(qr(), ctx()), lectura({ itbisFacturado: 372.24 }, ['itbisFacturado']), ctx())
    expect(observaciones(leida, CLIENTE.rncCedula)).toEqual(['ncf', 'itbisFacturado'])
    const b = aplicarVerificacion(leida, respuesta('aceptado'), AHORA)
    expect(observaciones(b, CLIENTE.rncCedula)).toEqual([])
    const doc = documentoDesdePagina('d1', b, CLIENTE, { nombre: 'lote.pdf', pagina: 1 }, AHORA)
    expect(doc).toMatchObject({
      itbisFacturado: 372.24, nombreContraparte: 'FERRETERIA EL SOL SRL',
      verificacionDGII: { estado: 'aceptado', consultadoEn: AHORA },
    })
    expect(doc.qrUrl).toMatch(/ConsultaTimbre/)
  })

  it('el ITBIS de la DGII reemplaza el de la IA; si la IA no cuadraba, el reparto de montos sigue en duda', () => {
    const leida = fusionarConLectura(interpretarPagina(qr(), ctx()), lectura(), ctx())
    const b = aplicarVerificacion(leida, respuesta('aceptado'), AHORA)
    expect(conDatosDGII(b).campos.itbisFacturado).toBe(372.24)
    expect(conDatosDGII(b).dudosos).toEqual(['montoServicios', 'montoBienes'])
  })

  it('si con el ITBIS de la DGII los montos no suman el total, los montos de la IA quedan en duda', () => {
    const leida = fusionarConLectura(interpretarPagina(qr(), ctx()), lectura({ montoBienes: 1000 }), ctx())
    const b = aplicarVerificacion(leida, respuesta('aceptado'), AHORA)
    expect(conDatosDGII(b).dudosos).toEqual(['montoServicios', 'montoBienes'])
  })

  it('rechazada o no encontrada: queda en observación por el NCF y no se aprueba en bloque', () => {
    const leida = fusionarConLectura(interpretarPagina(qr(), ctx()), lectura({ itbisFacturado: 372.24 }), ctx())
    expect(observaciones(leida, CLIENTE.rncCedula)).toEqual(['ncf'])
    for (const estado of ['rechazado', 'no_encontrado'] as const) {
      const b = aplicarVerificacion(leida, respuesta(estado), AHORA)
      expect(observaciones(b, CLIENTE.rncCedula), estado).toEqual(['ncf'])
      expect(documentoDesdePagina('d', b, CLIENTE, { nombre: 'l.pdf', pagina: 1 }, AHORA).camposIncompletos, estado).toEqual(['ncf'])
    }
  })

  it('serie B sin QR: no hay nada que verificar y no queda observación por eso (decisión del usuario)', () => {
    const b = fusionarConLectura(interpretarPagina(null, ctx()), lectura({ ncf: 'B0100000123', itbisFacturado: 372.24 }), ctx())
    expect(observaciones(b, CLIENTE.rncCedula)).toEqual([])
  })

  it('en proceso en la DGII: lo verifica una persona', () => {
    const leida = fusionarConLectura(interpretarPagina(qr(), ctx()), lectura({ itbisFacturado: 372.24 }), ctx())
    const b = aplicarVerificacion(leida, { estado: 'en_proceso', texto: 'En Proceso', datos: null }, AHORA)
    expect(observaciones(b, CLIENTE.rncCedula)).toEqual(['ncf'])
  })
})
