import { describe, expect, it } from 'vitest'
import { linea606, linea607 } from './dgii-formatos'
import { CAMPOS_VACIOS } from './documentos'
import { TITULOS_606, TITULOS_607, construirExcel606, construirExcel607 } from './excel-reporte'
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

  it('23 títulos numerados del formato + 2 de referencia', () => {
    const titulos = (hoja.data[filaTitulos] as Celda[]).map(valor)
    expect(titulos).toHaveLength(25)
    expect(titulos[0]).toBe('1. RNC o Cédula')
    expect(titulos[22]).toBe(`23. ${TITULOS_606[22]}`)
    expect(titulos[23]).toBe('Nombre del proveedor (referencia)')
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

describe('Excel del 607', () => {
  const consumo = venta({ ncf: 'B0200000001', fechaComprobante: '2026-03-16', montoFacturado: 1000, itbisFacturado: 180, montoTotal: 1180, rncCedulaContraparte: null, tipoIdentificacion: null, tipoIngreso: null, cobroEfectivo: null })
  const libro = construirExcel607(entrada([consumo, venta({ cobroEfectivo: 1000, cobroTarjeta: 1360 })]))
  const [detalle, resumen, hojaConsumo] = libro.hojas

  it('tres hojas: el formato, el resumen y las facturas de consumo', () => {
    expect(libro.nombreArchivo).toBe('Formato_607_401007551_202603.xlsx')
    expect(libro.hojas.map(h => h.sheet)).toEqual(['Formato 607', 'Resumen', 'Facturas de consumo'])
  })

  it('la factura de consumo menor no va en el detalle', () => {
    const filas = detalle.data.slice(detalle.stickyRowsCount) as Celda[][]
    expect(filas).toHaveLength(1)
    expect(comoLineaTxt(filas[0], [4])).toBe(linea607(venta({ cobroEfectivo: 1000, cobroTarjeta: 1360 })))
    expect(valor(filas[0][4])).toBe('1 - Ingresos por operaciones (no financieros)')
    expect((detalle.data[detalle.stickyRowsCount - 1] as Celda[]).map(valor)[22]).toBe(`23. ${TITULOS_607[22]}`)
  })

  it('el resumen trae los totales de consumo y la hoja de consumo el listado', () => {
    const plano = resumen.data.map(f => (f as Celda[]).map(valor))
    expect(plano).toContainEqual(['Cantidad de registros', 1])
    expect(plano).toContainEqual(['Facturas de consumo: cantidad', 1])
    expect(plano).toContainEqual(['Facturas de consumo: monto facturado', 1000])
    expect(plano).toContainEqual(['Facturas de consumo: ITBIS facturado', 180])
    const consumoPlano = hojaConsumo.data.map(f => (f as Celda[]).map(valor))
    expect(consumoPlano).toHaveLength(2)
    expect(consumoPlano[1]).toEqual(['B0200000001', '20260316', 1000, 180, 1180])
  })
})
