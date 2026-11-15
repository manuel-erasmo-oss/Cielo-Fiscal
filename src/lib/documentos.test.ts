import { describe, expect, it } from 'vitest'
import {
  CAMPOS_VACIOS,
  buscarDuplicado,
  esIncluibleEnReporte,
  montoFacturadoDe,
  normalizarDocumento,
  periodoDe,
  puedeMarcarseRevisada,
  validarCliente,
} from './documentos'
import type { ClienteFiscal, DocumentoFiscal } from '@/types'

const RNC_CLIENTE = '401007551'

function doc(cambios: Partial<DocumentoFiscal> = {}): DocumentoFiscal {
  return {
    ...CAMPOS_VACIOS,
    id: 'd1',
    contadorUid: 'local',
    clienteId: 'c1',
    tipo: 'compra',
    origen: 'manual',
    rncCedulaContraparte: '101123451',
    nombreContraparte: 'Proveedor SRL',
    tipoBienesServicios: '09',
    ncf: 'B0100000001',
    fechaComprobante: '2026-03-01',
    montoBienes: 1000,
    itbisFacturado: 180,
    montoTotal: 1180,
    formaPago: '01',
    confianzaOCR: 0,
    camposIncompletos: [],
    estadoRevision: 'revisado',
    creadoEn: '2026-03-02T10:00:00.000Z',
    actualizadoEn: '2026-03-02T10:00:00.000Z',
    ...cambios,
  }
}

function cliente(cambios: Partial<ClienteFiscal> = {}): ClienteFiscal {
  return {
    id: 'c1',
    contadorUid: 'local',
    tipoPersona: 'juridica',
    rncCedula: '101123456',
    razonSocial: 'Empresa SRL',
    activo: true,
    creadoEn: '2026-01-01T00:00:00.000Z',
    actualizadoEn: '2026-01-01T00:00:00.000Z',
    ...cambios,
  }
}

describe('revisión de facturas', () => {
  it('completa: puede marcarse revisada', () => {
    expect(puedeMarcarseRevisada('compra', doc(), RNC_CLIENTE)).toBe(true)
  })

  it('ITBIS en cero es un dato, no un faltante', () => {
    expect(puedeMarcarseRevisada('compra', doc({ itbisFacturado: 0 }), RNC_CLIENTE)).toBe(true)
  })

  it('no puede marcarse revisada si el formato de la DGII le objeta algo', () => {
    expect(puedeMarcarseRevisada('compra', doc({ ncf: null }), RNC_CLIENTE)).toBe(false)
    expect(puedeMarcarseRevisada('compra', doc({ fechaComprobante: null }), RNC_CLIENTE)).toBe(false)
    expect(puedeMarcarseRevisada('compra', doc({ tipoBienesServicios: null }), RNC_CLIENTE)).toBe(false)
  })

  it('nombre, forma de pago, fecha de pago y retenciones no son obligatorios', () => {
    expect(puedeMarcarseRevisada('compra', doc({ nombreContraparte: null }), RNC_CLIENTE)).toBe(true)
    expect(puedeMarcarseRevisada('compra', doc({ formaPago: null, fechaPago: null, itbisRetenido: null, tipoRetencionISR: null }), RNC_CLIENTE)).toBe(true)
  })

  it('solo entra a un reporte si está revisada Y sin errores', () => {
    expect(esIncluibleEnReporte(doc(), RNC_CLIENTE)).toBe(true)
    expect(esIncluibleEnReporte(doc({ estadoRevision: 'pendiente_revision' }), RNC_CLIENTE)).toBe(false)
    expect(esIncluibleEnReporte(doc({ estadoRevision: 'descartado' }), RNC_CLIENTE)).toBe(false)
    expect(esIncluibleEnReporte(doc({ ncf: null }), RNC_CLIENTE)).toBe(false)
  })

  it('montoFacturadoDe: compras suman servicios y bienes; ventas usan su campo', () => {
    expect(montoFacturadoDe(doc({ montoServicios: 250 }))).toBe(1250)
    expect(montoFacturadoDe(doc({ montoServicios: null, montoBienes: null }))).toBeNull()
    expect(montoFacturadoDe(doc({ tipo: 'venta', montoFacturado: 700 }))).toBe(700)
  })

  it('normalizarDocumento completa con null lo que le falte a un registro viejo', () => {
    const { formaPago: _f, cobroEfectivo: _c, ...viejo } = doc()
    const normal = normalizarDocumento(viejo as DocumentoFiscal)
    expect(normal.formaPago).toBeNull()
    expect(normal.cobroEfectivo).toBeNull()
    expect(normal.ncf).toBe('B0100000001')
  })

  it('periodoDe', () => {
    expect(periodoDe(doc())).toBe('2026-03')
    expect(periodoDe(doc({ fechaComprobante: null }))).toBeNull()
  })
})

describe('buscarDuplicado', () => {
  const existentes = [doc()]

  it('detecta el mismo comprobante aunque cambien mayúsculas y espacios', () => {
    expect(buscarDuplicado(doc({ id: 'd2', ncf: ' b01 00000001 ' }), existentes)?.id).toBe('d1')
  })

  it('no se compara consigo mismo (edición)', () => {
    expect(buscarDuplicado(doc(), existentes)).toBeUndefined()
  })

  it.each([
    ['otro cliente', { clienteId: 'c2' }],
    ['otro tipo', { tipo: 'venta' as const }],
    ['otro NCF', { ncf: 'B0100000002' }],
    ['otra contraparte', { rncCedulaContraparte: '101999999' }],
    ['sin NCF', { ncf: null }],
  ])('no es duplicado: %s', (_nombre, cambios) => {
    expect(buscarDuplicado(doc({ id: 'd2', ...cambios }), existentes)).toBeUndefined()
  })

  it('ignora las descartadas', () => {
    expect(buscarDuplicado(doc({ id: 'd2' }), [doc({ estadoRevision: 'descartado' })])).toBeUndefined()
  })
})

describe('validarCliente', () => {
  const base = { tipoPersona: 'juridica' as const, rncCedula: '101-12345-6', razonSocial: 'Empresa SRL', nombreComercial: '' }

  it('acepta RNC de 9 dígitos y cédula de 11, con o sin guiones', () => {
    expect(validarCliente(base, [])).toEqual({})
    expect(validarCliente({ ...base, rncCedula: '001-1234567-8' }, [])).toEqual({})
  })

  it('rechaza longitudes distintas y campos vacíos', () => {
    expect(validarCliente({ ...base, rncCedula: '12345' }, []).rncCedula).toBeDefined()
    expect(validarCliente({ ...base, rncCedula: '' }, []).rncCedula).toBeDefined()
    expect(validarCliente({ ...base, razonSocial: '   ' }, []).razonSocial).toBeDefined()
  })

  it('rechaza un RNC repetido, salvo al editar ese mismo cliente', () => {
    expect(validarCliente(base, [cliente()]).rncCedula).toBeDefined()
    expect(validarCliente(base, [cliente()], 'c1')).toEqual({})
  })
})
