import { describe, expect, it } from 'vitest'
import { CAMPOS_VACIOS } from './documentos'
import {
  FILTROS_VACIOS, agruparPorContraparte, claveContraparte, coincideBusqueda, csvDeComprobantes, esAprobable,
  estadoDeFila, fechaCorta, filtrarComprobantes, hayFiltros, ordenarComprobantes, ordenarContrapartes, paginar,
  resumenPorEstado, totalDe, totalesDe, nombreClienteVenta, exigirTipoDeModulo, TipoEquivocadoError,
} from './comprobantes'
import type { DocumentoFiscal } from '@/types'

const RNC_CLIENTE = '401007551'
let n = 0
function compra(p: Partial<DocumentoFiscal> = {}): DocumentoFiscal {
  n++
  return {
    ...CAMPOS_VACIOS,
    id: `d${n}`, contadorUid: 'local', clienteId: 'e1', tipo: 'compra', origen: 'manual',
    rncCedulaContraparte: '101123451', nombreContraparte: 'Ferretería El Sol SRL', tipoBienesServicios: '09',
    ncf: `B01000000${String(10 + n).padStart(2, '0')}`, fechaComprobante: '2026-03-01',
    montoBienes: 1000, itbisFacturado: 180, montoTotal: 1180,
    confianzaOCR: 0.9, camposIncompletos: [], estadoRevision: 'pendiente_revision',
    creadoEn: `2026-03-02T10:00:${String(n % 60).padStart(2, '0')}.000Z`, actualizadoEn: '2026-03-02T10:00:00.000Z',
    ...p,
  } as DocumentoFiscal
}
const venta = (p: Partial<DocumentoFiscal> = {}) =>
  compra({ tipo: 'venta', montoBienes: null, tipoBienesServicios: null, montoFacturado: 2000, itbisFacturado: 360, montoTotal: 2360, ...p })

const rechazo = { estado: 'rechazado' as const, texto: 'Rechazado', consultadoEn: '2026-03-03T00:00:00Z' }

describe('cliente de una venta sin nombre y módulos independientes (2026-11-19)', () => {
  it('"Consumidor final" solo con comprobante de consumo (B02/E32)', () => {
    expect(nombreClienteVenta({ nombreContraparte: null, rncCedulaContraparte: null, ncf: 'B0200000001' })).toBe('Consumidor final')
    expect(nombreClienteVenta({ nombreContraparte: null, rncCedulaContraparte: null, ncf: 'E320000000001' })).toBe('Consumidor final')
    expect(nombreClienteVenta({ nombreContraparte: null, rncCedulaContraparte: null, ncf: 'B0100000001' })).toBe('Cliente sin identificar')
    expect(nombreClienteVenta({ nombreContraparte: null, rncCedulaContraparte: '101123451', ncf: 'B0100000001' })).toBeNull()
    expect(nombreClienteVenta({ nombreContraparte: 'Ana SRL', rncCedulaContraparte: null, ncf: 'B0100000001' })).toBe('Ana SRL')
  })

  it('se agrupan aparte el consumidor final y los clientes sin identificar', () => {
    expect(claveContraparte(venta({ rncCedulaContraparte: null, nombreContraparte: null, ncf: 'B0200000001' }))).toBe('consumidor-final')
    expect(claveContraparte(venta({ rncCedulaContraparte: null, nombreContraparte: null, ncf: 'B0100000001' }))).toBe('sin-identificar')
  })

  it('una venta de crédito fiscal sin cliente no se aprueba en bloque', () => {
    expect(esAprobable(venta({ rncCedulaContraparte: null, nombreContraparte: null, ncf: 'B0100000099' }), RNC_CLIENTE)).toBe(false)
    expect(esAprobable(venta({ rncCedulaContraparte: null, nombreContraparte: null, ncf: 'B0200000099' }), RNC_CLIENTE)).toBe(true)
  })

  it('cada módulo guarda solo su tipo', () => {
    expect(() => exigirTipoDeModulo('venta', [venta()])).not.toThrow()
    expect(() => exigirTipoDeModulo('venta', [venta(), compra()])).toThrow(TipoEquivocadoError)
    expect(() => exigirTipoDeModulo('compra', [venta()])).toThrow('En Costos y gastos solo se registran facturas de compra.')
  })
})

describe('estado de una fila', () => {
  it('uno solo, el más grave: rechazada > revisada > verificar en la DGII > por revisar', () => {
    expect(estadoDeFila(compra({ estadoRevision: 'revisado', verificacionDGII: rechazo }))).toBe('rechazada')
    expect(estadoDeFila(compra({ verificacionDGII: { ...rechazo, estado: 'no_encontrado' } }))).toBe('rechazada')
    expect(estadoDeFila(compra({ estadoRevision: 'revisado', ncf: 'E310000000001' }))).toBe('revisada')
    // e-CF sin verificar: una persona tiene que verificarla.
    expect(estadoDeFila(compra({ ncf: 'E310000000001' }))).toBe('verificar')
    expect(estadoDeFila(compra())).toBe('por_revisar')
  })

  it('aprobable: pendiente, sin observaciones, sin verificación humana y sin errores del formato', () => {
    expect(esAprobable(compra(), RNC_CLIENTE)).toBe(true)
    expect(esAprobable(compra({ estadoRevision: 'revisado' }), RNC_CLIENTE)).toBe(false)
    expect(esAprobable(compra({ camposIncompletos: ['ncf'] }), RNC_CLIENTE)).toBe(false)
    expect(esAprobable(compra({ ncf: 'E310000000001' }), RNC_CLIENTE)).toBe(false)
    expect(esAprobable(compra({ tipoBienesServicios: null }), RNC_CLIENTE)).toBe(false)
    expect(esAprobable(venta({ ncf: 'B0200000001', rncCedulaContraparte: null }), RNC_CLIENTE)).toBe(true)
  })
})

describe('montos', () => {
  it('total: el impreso o, si falta, la suma del monto y los impuestos', () => {
    expect(totalDe(compra())).toBe(1180)
    expect(totalDe(compra({ montoTotal: null, montoServicios: 100, otrosImpuestos: 10 }))).toBe(1290)
    expect(totalDe(compra({ montoTotal: null, montoBienes: null }))).toBeNull()
  })

  it('las notas de crédito (B04 y E34) restan', () => {
    const t = totalesDe([compra(), compra({ ncf: 'B0400000001', montoBienes: 200, itbisFacturado: 36, montoTotal: 236 }), compra({ ncf: 'E340000000001', montoBienes: 100, itbisFacturado: 18, montoTotal: 118 })])
    expect(t).toEqual({ cantidad: 3, monto: 700, itbis: 126, total: 826 })
  })

  it('barra de dinero: cantidad y total de cada estado', () => {
    const r = resumenPorEstado([
      compra(), compra({ montoTotal: 500 }),
      compra({ estadoRevision: 'revisado' }),
      compra({ verificacionDGII: rechazo }),
      compra({ ncf: 'E310000000002' }),
      compra({ ncf: 'B0400000009', estadoRevision: 'revisado', montoTotal: 100 }),
    ])
    expect(r.por_revisar).toEqual({ cantidad: 2, total: 1680 })
    expect(r.revisada).toEqual({ cantidad: 2, total: 1080 })
    expect(r.rechazada).toEqual({ cantidad: 1, total: 1180 })
    expect(r.verificar).toEqual({ cantidad: 1, total: 1180 })
  })
})

describe('búsqueda y filtros', () => {
  const d = compra({ nombreContraparte: 'Papelería Central', rncCedulaContraparte: '00112345673', ncf: 'E310000004321' })

  it('por nombre sin acentos, por RNC con o sin guiones y por NCF', () => {
    expect(coincideBusqueda(d, 'papeleria')).toBe(true)
    expect(coincideBusqueda(d, '001-1234567-3')).toBe(true)
    expect(coincideBusqueda(d, '1234567')).toBe(true)
    expect(coincideBusqueda(d, 'e31000000432')).toBe(true)
    expect(coincideBusqueda(d, 'ferreteria')).toBe(false)
    expect(coincideBusqueda(d, '')).toBe(true)
  })

  it('cada módulo ve solo su tipo; estado, mes, clasificación y contraparte', () => {
    const docs = [
      compra({ tipoBienesServicios: '09' }),
      compra({ tipoBienesServicios: '10', fechaComprobante: '2026-04-02' }),
      compra({ tipoBienesServicios: '02', estadoRevision: 'revisado' }),
      compra({ tipoBienesServicios: null, rncCedulaContraparte: '130000001' }),
      venta(),
    ]
    expect(filtrarComprobantes(docs, 'venta', FILTROS_VACIOS)).toHaveLength(1)
    expect(filtrarComprobantes(docs, 'compra', FILTROS_VACIOS)).toHaveLength(4)
    expect(filtrarComprobantes(docs, 'compra', { ...FILTROS_VACIOS, clasificacion: 'Costo' })).toEqual([docs[0]])
    expect(filtrarComprobantes(docs, 'compra', { ...FILTROS_VACIOS, clasificacion: 'Activo' })).toEqual([docs[1]])
    expect(filtrarComprobantes(docs, 'compra', { ...FILTROS_VACIOS, clasificacion: 'Gasto' })).toEqual([docs[2]])
    expect(filtrarComprobantes(docs, 'compra', { ...FILTROS_VACIOS, clasificacion: 'sin' })).toEqual([docs[3]])
    expect(filtrarComprobantes(docs, 'compra', { ...FILTROS_VACIOS, periodo: '2026-04' })).toEqual([docs[1]])
    expect(filtrarComprobantes(docs, 'compra', { ...FILTROS_VACIOS, estado: 'revisada' })).toEqual([docs[2]])
    expect(filtrarComprobantes(docs, 'compra', { ...FILTROS_VACIOS, contraparte: 'rnc:130000001' })).toEqual([docs[3]])
    // La barra de dinero cuenta todos los estados con los demás filtros.
    expect(filtrarComprobantes(docs, 'compra', { ...FILTROS_VACIOS, estado: 'revisada', periodo: '2026-03' }, 'estado')).toHaveLength(3)
    expect(hayFiltros(FILTROS_VACIOS)).toBe(false)
    expect(hayFiltros({ ...FILTROS_VACIOS, busqueda: '  ' })).toBe(false)
    expect(hayFiltros({ ...FILTROS_VACIOS, clasificacion: 'sin' })).toBe(true)
  })
})

describe('orden y paginación', () => {
  const a = compra({ fechaComprobante: '2026-03-05', nombreContraparte: 'Beta', montoTotal: 300 })
  const b = compra({ fechaComprobante: '2026-03-01', nombreContraparte: 'Ámbar', montoTotal: 900 })
  const c = compra({ fechaComprobante: null, nombreContraparte: null, montoTotal: null, montoBienes: null })
  const nc = compra({ fechaComprobante: '2026-03-03', nombreContraparte: 'Zeta', ncf: 'B0400000001', montoTotal: 500 })

  it('por fecha: sin fecha siempre primero', () => {
    expect(ordenarComprobantes([a, b, c, nc], { campo: 'fecha', dir: 'desc' })).toEqual([c, a, nc, b])
    expect(ordenarComprobantes([a, b, c, nc], { campo: 'fecha', dir: 'asc' })).toEqual([c, b, nc, a])
  })

  it('por contraparte (sin acentos ni mayúsculas) y por total con signo; vacíos al final', () => {
    expect(ordenarComprobantes([a, b, c, nc], { campo: 'contraparte', dir: 'asc' })).toEqual([b, a, nc, c])
    expect(ordenarComprobantes([a, b, c, nc], { campo: 'contraparte', dir: 'desc' })).toEqual([nc, a, b, c])
    expect(ordenarComprobantes([a, b, c, nc], { campo: 'total', dir: 'desc' })).toEqual([b, a, nc, c])
    expect(ordenarComprobantes([a, b, c, nc], { campo: 'total', dir: 'asc' })).toEqual([nc, a, b, c])
  })

  it('pagina de 25 y ajusta la página pedida', () => {
    const lista = Array.from({ length: 60 }, (_, i) => i)
    expect(paginar(lista, 1)).toMatchObject({ pagina: 1, totalPaginas: 3, desde: 1, hasta: 25, total: 60 })
    expect(paginar(lista, 3)).toMatchObject({ pagina: 3, desde: 51, hasta: 60 })
    expect(paginar(lista, 3).items).toHaveLength(10)
    expect(paginar(lista, 9).pagina).toBe(3)
    expect(paginar(lista, 0).pagina).toBe(1)
    expect(paginar([], 1)).toMatchObject({ pagina: 1, totalPaginas: 1, desde: 0, hasta: 0, total: 0 })
  })
})

it('fecha corta dd/mm/aaaa sin pasar por Date', () => {
  expect(fechaCorta('2026-03-01')).toBe('01/03/2026')
  expect(fechaCorta('raro')).toBe('raro')
})

describe('proveedores y clientes', () => {
  it('agrupa por RNC (con o sin guiones), luego por nombre; el nombre más reciente', () => {
    const docs = [
      compra({ rncCedulaContraparte: '101123451', nombreContraparte: 'El Sol', fechaComprobante: '2026-02-01', estadoRevision: 'revisado' }),
      compra({ rncCedulaContraparte: '101-12345-1', nombreContraparte: 'Ferretería El Sol SRL', fechaComprobante: '2026-03-10' }),
      compra({ rncCedulaContraparte: '101123451', ncf: 'B0400000001', montoBienes: 100, itbisFacturado: 18, montoTotal: 118, fechaComprobante: '2026-03-05', estadoRevision: 'revisado' }),
      compra({ rncCedulaContraparte: null, nombreContraparte: 'Colmado  Doña Ana' }),
      compra({ rncCedulaContraparte: null, nombreContraparte: 'colmado doña ana' }),
      venta({ rncCedulaContraparte: null, nombreContraparte: null }),
    ]
    const filas = agruparPorContraparte(docs)
    const sol = filas.find(f => f.clave === 'rnc:101123451')!
    expect(sol).toMatchObject({ nombre: 'Ferretería El Sol SRL', rnc: '101123451', cantidad: 3, monto: 1900, itbis: 342, ultimaFecha: '2026-03-10', porRevisar: 1 })
    expect(filas.find(f => f.clave === 'nombre:colmado dona ana')!.cantidad).toBe(2)
    expect(claveContraparte(docs[5])).toBe('sin-identificar')
    expect(filas).toHaveLength(3)
    const porMonto = ordenarContrapartes(filas, { campo: 'monto', dir: 'desc' })
    expect(porMonto[0].clave).toBe('nombre:colmado dona ana')
    const porNombre = ordenarContrapartes(filas, { campo: 'nombre', dir: 'asc' })
    expect(porNombre.map(f => f.clave)).toEqual(['nombre:colmado dona ana', 'rnc:101123451', 'sin-identificar'])
  })
})

describe('CSV', () => {
  it('UTF-8 con BOM, comas, CRLF, RNC como texto y notas de crédito en negativo', () => {
    const csv = csvDeComprobantes([
      compra({ rncCedulaContraparte: '00112345673', nombreContraparte: 'Pérez, Juan', ncf: 'B0100000001', fechaComprobante: '2026-03-01' }),
      compra({ ncf: 'B0400000002', montoBienes: 100, itbisFacturado: 18, montoTotal: 118, tipoBienesServicios: '10', estadoRevision: 'revisado' }),
    ], 'compra')
    expect(csv.startsWith('﻿Fecha,NCF,')).toBe(true)
    const lineas = csv.slice(1).split('\r\n')
    expect(lineas).toHaveLength(3)
    expect(lineas[1]).toBe('2026-03-01,B0100000001,,="00112345673","Pérez, Juan",09 - Compras y gastos que formarán parte del costo de venta,Costo,,1000.00,1000.00,180.00,1180.00,Por revisar,')
    expect(lineas[2]).toContain('-100.00,-100.00,-18.00,-118.00,Revisada')
    expect(lineas[2]).toContain('10 - Adquisiciones de activos,Activo')
  })

  it('ventas: cliente, consumidor final y tipo de ingreso', () => {
    const csv = csvDeComprobantes([venta({ rncCedulaContraparte: null, nombreContraparte: null, tipoIngreso: '1', ncf: 'B0200000001' })], 'venta')
    const [encabezado, fila] = csv.slice(1).split('\r\n')
    expect(encabezado).toBe('Fecha,NCF,NCF modificado,RNC o cédula del cliente,Cliente,Tipo de ingreso,Monto sin impuestos,ITBIS,Total,Estado,Verificación en la DGII')
    expect(fila).toBe('2026-03-01,B0200000001,,,Consumidor final,1 - Ingresos por operaciones (no financieros),2000.00,360.00,2360.00,Por revisar,')
  })
})
