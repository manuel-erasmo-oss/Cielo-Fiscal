import { describe, expect, it } from 'vitest'
import { linea606 } from './dgii-formatos'
import { CAMPOS_VACIOS } from './documentos'
import { TITULOS_606, TITULOS_INGRESOS, construirExcel606, construirExcelIngresos } from './excel-reporte'
import type { DocumentoFiscal } from '@/types'

const cliente = { rncCedula: '401007551', razonSocial: 'Comercial Quisqueya SRL' }

function doc(cambios: Partial<DocumentoFiscal>): DocumentoFiscal {
  return {
    ...CAMPOS_VACIOS,
    id: cambios.ncf ?? 'x',
    contadorUid: 'local',
    clienteId: 'c1',
    tipo: 'compra',
    origen: 'manual',
    confianzaOCR: 0,
    camposIncompletos: [],
    estadoRevision: 'revisado',
    creadoEn: '2026-03-02T10:00:00.000Z',
    actualizadoEn: '2026-03-02T10:00:00.000Z',
    ...cambios,
  }
}

const compra = (cambios: Partial<DocumentoFiscal> = {}) => doc({
  rncCedulaContraparte: '101123451', nombreContraparte: 'Ferretería El Sol SRL', tipoBienesServicios: '09',
  ncf: 'B0100000123', fechaComprobante: '2026-03-01', montoServicios: 0, montoBienes: 1000, itbisFacturado: 180,
  montoTotal: 1180, formaPago: '04', ...cambios,
})

const venta = (cambios: Partial<DocumentoFiscal> = {}) => doc({
  tipo: 'venta', rncCedulaContraparte: '101123451', nombreContraparte: 'Cliente SRL', tipoIdentificacion: '1',
  ncf: 'B0100000500', tipoIngreso: '1', fechaComprobante: '2026-03-15', montoFacturado: 2000, itbisFacturado: 360,
  montoTotal: 2360, cobroEfectivo: 2360, ...cambios,
})

type Celda = null | undefined | string | number | { value?: unknown }
const valor = (c: Celda) => (c !== null && typeof c === 'object' ? c.value : c)

// Convierte una fila del Excel a la línea del TXT: los códigos van sin su
// nombre, los montos con 2 decimales y lo vacío como cadena vacía.
function comoLineaTxt(fila: Celda[], columnasDeCodigo: number[]): string {
  return fila.slice(0, 23).map((celda, i) => {
    const v = valor(celda)
    if (v === null || v === undefined) return ''
    if (typeof v === 'number') return v.toFixed(2)
    return columnasDeCodigo.includes(i) ? String(v).split(' - ')[0] : String(v)
  }).join('|')
}

const entrada = (validas: DocumentoFiscal[], pendientes = 0, conErrores = 0) =>
  ({ cliente, periodo: '202603', validas, pendientes, conErrores })

describe('Excel del 606', () => {
  const nota = compra({ ncf: 'B0400000007', ncfModificado: 'B0100000123', fechaComprobante: '2026-03-10', montoBienes: 100, itbisFacturado: 18, montoTotal: 118 })
  const conRetencion = compra({
    ncf: 'B0100000200', fechaComprobante: '2026-03-05', fechaPago: '2026-03-20', montoServicios: 500, itbisRetenido: 54,
    tipoRetencionISR: '02', montoRetencionRenta: 50, itbisLlevadoAlCosto: 20, propinaLegal: 10,
  })
  const libro = construirExcel606(entrada([nota, compra(), conRetencion]))
  const hoja = libro.hojas[0]
  const filaTitulos = hoja.stickyRowsCount - 1
  const filas = hoja.data.slice(hoja.stickyRowsCount) as Celda[][]

  it('nombre de archivo, hojas y tabla limpia con títulos en la fila 1', () => {
    expect(libro.nombreArchivo).toBe('Formato_606_401007551_202603.xlsx')
    expect(libro.hojas.map(h => h.sheet)).toEqual(['Formato 606', 'Resumen'])
    expect(hoja.stickyRowsCount).toBe(1)
  })

  it('23 títulos numerados del formato + 3 de referencia', () => {
    const titulos = (hoja.data[filaTitulos] as Celda[]).map(valor)
    expect(titulos).toHaveLength(26)
    expect(titulos[0]).toBe('1. RNC o Cédula')
    expect(titulos[22]).toBe(`23. ${TITULOS_606[22]}`)
    expect(titulos[23]).toBe('Nombre del proveedor (referencia)')
    expect(titulos[25]).toBe('Clasificación contable (referencia)')
  })

  it('las filas van ordenadas por fecha', () => {
    expect(filas.map(f => valor(f[3]))).toEqual(['B0100000123', 'B0100000200', 'B0400000007'])
  })

  it('cada fila coincide campo por campo con la línea del TXT', () => {
    const ordenadas = [compra(), conRetencion, nota]
    filas.forEach((fila, i) => {
      expect(comoLineaTxt(fila, [2, 16, 22]), `fila ${i}`).toBe(linea606(ordenadas[i]))
    })
  })

  it('los códigos llevan su nombre y los identificadores son texto', () => {
    expect(valor(filas[0][2])).toBe('09 - Compras y gastos que formarán parte del costo de venta')
    expect(valor(filas[0][22])).toBe('04 - Compra a crédito')
    expect(filas[0][0]).toMatchObject({ value: '101123451', format: '@' })
    expect(filas[0][5]).toMatchObject({ value: '20260301', format: '@' })
    expect(filas[0][9]).toMatchObject({ value: 1000, format: '#,##0.00' })
    expect(valor(filas[0][25])).toBe('Costo') // tipo 09
  })

  it('la hoja Resumen trae los totales del TXT (la nota de crédito resta) y el estado', () => {
    const plano = libro.hojas[1].data.map(f => (f as Celda[]).map(valor))
    expect(plano).toContainEqual(['RNC o Cédula', '401007551'])
    expect(plano).toContainEqual(['Cantidad de registros', 3])
    expect(plano).toContainEqual(['Total monto facturado', 2400])
    expect(plano).toContainEqual(['Total ITBIS facturado', 342])
    expect(plano).toContainEqual(['Estado', 'Completo: incluye todas las facturas del período.'])
  })

  it('si quedaron facturas fuera, lo dicen el nombre del archivo y el resumen', () => {
    const incompleto = construirExcel606(entrada([compra()], 2, 1))
    expect(incompleto.nombreArchivo).toBe('Formato_606_401007551_202603_INCOMPLETO.xlsx')
    const celdas = incompleto.hojas[1].data.flat().map(c => valor(c as Celda))
    expect(celdas.some(v => typeof v === 'string' && v.startsWith('INCOMPLETO: quedaron fuera 2 factura(s) por revisar y 1 con errores'))).toBe(true)
  })
})

describe('Excel del reporte de ingresos', () => {
  const consumo = venta({ ncf: 'B0200000001', fechaComprobante: '2026-03-16', montoFacturado: 1000, itbisFacturado: 180, montoTotal: 1180, rncCedulaContraparte: null, nombreContraparte: null, tipoIdentificacion: null, tipoIngreso: null, cobroEfectivo: null })
  const electronica = venta({ ncf: 'E310000000009', fechaComprobante: '2026-03-02', montoFacturado: 500, itbisFacturado: 90, montoTotal: 590, cobroEfectivo: null })
  const nota = venta({ ncf: 'B0400000003', ncfModificado: 'B0100000500', fechaComprobante: '2026-03-20', montoFacturado: 100, itbisFacturado: 18, montoTotal: 118, cobroEfectivo: null })
  const libro = construirExcelIngresos(entrada([consumo, venta({ cobroEfectivo: 1000, cobroTarjeta: 1360 }), nota, electronica]))
  const [hoja, resumen] = libro.hojas
  const filas = hoja.data.slice(1) as Celda[][]

  it('nombre de archivo y hojas', () => {
    expect(libro.nombreArchivo).toBe('Ingresos_401007551_202603.xlsx')
    expect(libro.hojas.map(h => h.sheet)).toEqual(['Ingresos', 'Resumen'])
    expect((hoja.data[0] as Celda[]).map(valor)).toEqual([...TITULOS_INGRESOS])
  })

  it('incluye TODAS las ventas (consumo y e-NCF también), ordenadas por fecha', () => {
    expect(filas.map(f => valor(f[1]))).toEqual(['E310000000009', 'B0100000500', 'B0200000001', 'B0400000003'])
  })

  it('una fila: fecha legible, tipo de ingreso con nombre, montos y cobros', () => {
    const fila = filas[1].map(valor)
    expect(fila.slice(0, 6)).toEqual(['2026-03-15', 'B0100000500', undefined, '101123451', 'Cliente SRL', '1 - Ingresos por operaciones (no financieros)'].map(v => v ?? null))
    expect(fila.slice(6, 12)).toEqual([2000, 360, null, null, null, 2360])
    expect(fila[15]).toBe(1000) // efectivo
    expect(fila[17]).toBe(1360) // tarjeta
    expect(fila).toHaveLength(TITULOS_INGRESOS.length)
  })

  it('el resumen suma todo y la nota de crédito resta', () => {
    const plano = resumen.data.map(f => (f as Celda[]).map(valor))
    expect(plano).toContainEqual(['Cantidad de registros', 4])
    expect(plano).toContainEqual(['Total monto facturado', 3400]) // 500 + 2000 + 1000 − 100
    expect(plano).toContainEqual(['Total ITBIS facturado', 612])  // 90 + 360 + 180 − 18
    expect(plano).toContainEqual(['Total de las facturas', 4012]) // 590 + 2360 + 1180 − 118
  })

  it('una venta sin total impreso usa lo facturado más impuestos', () => {
    const sinTotal = construirExcelIngresos(entrada([venta({ montoTotal: null, propinaLegal: 200, cobroEfectivo: null })]))
    expect(valor((sinTotal.hojas[0].data[1] as Celda[])[11])).toBe(2560)
    expect(sinTotal.hojas[1].data.map(f => (f as Celda[]).map(valor))).toContainEqual(['Total de las facturas', 2560])
  })

  it('incompleto: lo dice el nombre del archivo', () => {
    expect(construirExcelIngresos(entrada([venta()], 1, 0)).nombreArchivo).toBe('Ingresos_401007551_202603_INCOMPLETO.xlsx')
  })
})
