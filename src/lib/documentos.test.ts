import { describe, expect, it } from 'vitest'
import {
  buscarDuplicado,
  camposRequeridosFaltantes,
  esIncluibleEnReporte,
  periodoDe,
  puedeMarcarseRevisada,
  validarCliente,
} from './documentos'
import type { ClienteFiscal, DocumentoFiscal } from '@/types'

function doc(cambios: Partial<DocumentoFiscal> = {}): DocumentoFiscal {
  return {
    id: 'd1',
    contadorUid: 'local',
    clienteId: 'c1',
    tipo: 'compra',
    origen: 'manual',
    rncCedulaContraparte: '101123456',
    nombreContraparte: 'Proveedor SRL',
    ncf: 'B0100000001',
    ncfModificado: null,
    fechaComprobante: '2026-03-01',
    fechaPago: null,
    montoFacturado: 1000,
    itbisFacturado: 180,
    montoTotal: 1180,
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
  it('completa: no falta nada y puede marcarse revisada', () => {
    expect(camposRequeridosFaltantes(doc())).toEqual([])
    expect(puedeMarcarseRevisada(doc())).toBe(true)
  })

  it('los campos opcionales vacíos no bloquean', () => {
    expect(puedeMarcarseRevisada(doc({ ncfModificado: null, fechaPago: null }))).toBe(true)
  })

  it('ITBIS en cero es un dato, no un faltante', () => {
    expect(puedeMarcarseRevisada(doc({ itbisFacturado: 0 }))).toBe(true)
  })

  it('lista los requeridos vacíos', () => {
    expect(camposRequeridosFaltantes(doc({ ncf: null, montoTotal: null }))).toEqual(['ncf', 'montoTotal'])
  })

  it('solo entra a un reporte si está revisada Y completa', () => {
    expect(esIncluibleEnReporte(doc())).toBe(true)
    expect(esIncluibleEnReporte(doc({ estadoRevision: 'pendiente_revision' }))).toBe(false)
    expect(esIncluibleEnReporte(doc({ estadoRevision: 'descartado' }))).toBe(false)
    expect(esIncluibleEnReporte(doc({ ncf: null }))).toBe(false)
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
