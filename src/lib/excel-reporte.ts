import type { SheetData } from 'write-excel-file/browser'
import {
  COBROS_607,
  FORMA_PAGO_606,
  TIPO_BIENES_SERVICIOS_606,
  TIPO_INGRESO_607,
  TIPO_RETENCION_ISR_606,
  clasificacionContable,
  esNotaDeCredito,
  generar606,
  type OpcionCatalogo,
} from '@/lib/dgii-formatos'
import type { ClienteFiscal, DocumentoFiscal } from '@/types'

// Exportación a Excel del Formato 606 (compras) y del reporte de ingresos
// (ventas). El del 606 es un papel de trabajo: lo que se envía a la DGII
// sigue siendo el TXT. El de ingresos es el reporte en sí: es de uso
// interno, no se envía a la DGII. La primera hoja es una tabla limpia (títulos en la fila 1)
// para poder filtrar y ordenar: sus 23 primeras columnas son las del
// formato, en el mismo orden y con los mismos valores que el TXT; después
// van columnas de referencia que no existen en el formato (nombre y total
// de la factura). El resumen y el estado del reporte van en otra hoja, y si
// el reporte está incompleto también lo dice el nombre del archivo.
//
// Este archivo solo arma los datos (probado sin navegador); quien escribe
// el .xlsx es la pantalla, con `write-excel-file`.

export interface HojaExcel {
  sheet: string
  data: SheetData
  columns: { width: number }[]
  // Filas superiores que quedan fijas al desplazarse.
  stickyRowsCount: number
}

export interface LibroExcel {
  nombreArchivo: string
  hojas: HojaExcel[]
}

export interface EntradaExcel {
  cliente: Pick<ClienteFiscal, 'rncCedula' | 'razonSocial'>
  // AAAAMM
  periodo: string
  // Facturas del período revisadas y sin errores (las mismas del TXT; en el
  // 607 incluye las de consumo, que aquí se separan).
  validas: readonly DocumentoFiscal[]
  // Facturas del período que quedaron fuera.
  pendientes: number
  conErrores: number
  // Solo 606: forma de pago para las compras que no la indican.
  formaPagoPorDefecto?: string
}

export const TITULOS_606 = [
  'RNC o Cédula', 'Tipo Id', 'Tipo Bienes y Servicios Comprados', 'NCF', 'NCF ó Documento Modificado',
  'Fecha Comprobante', 'Fecha Pago', 'Monto Facturado en Servicios', 'Monto Facturado en Bienes',
  'Total Monto Facturado', 'ITBIS Facturado', 'ITBIS Retenido', 'ITBIS sujeto a Proporcionalidad (Art. 349)',
  'ITBIS llevado al Costo', 'ITBIS por Adelantar', 'ITBIS percibido en compras', 'Tipo de Retención en ISR',
  'Monto Retención Renta', 'ISR Percibido en compras', 'Impuesto Selectivo al Consumo', 'Otros Impuesto/Tasas',
  'Monto Propina Legal', 'Forma de Pago',
] as const

export const TITULOS_INGRESOS = [
  'Fecha', 'NCF', 'NCF modificado', 'RNC / Cédula del cliente', 'Nombre del cliente', 'Tipo de ingreso',
  'Monto facturado', 'ITBIS facturado', 'Impuesto selectivo al consumo', 'Otros impuestos / tasas',
  'Propina legal', 'Total de la factura', 'ITBIS retenido por terceros', 'Retención de renta por terceros',
  'Fecha de retención', 'Efectivo', 'Cheque / transferencia / depósito', 'Tarjeta débito / crédito',
  'Venta a crédito', 'Bonos o certificados de regalo', 'Permuta', 'Otras formas',
] as const

const FORMATO_MONTO = '#,##0.00'
const AZUL = '#1B2980'

// Texto explícito ("@"): evita que Excel convierta un RNC o una fecha
// AAAAMMDD en número y le quite los ceros de la izquierda.
const texto = (valor: string | null) => (valor ? { value: valor, type: String, format: '@' } : null)
const monto = (valor: number | null) => (valor === null ? null : { value: valor, type: Number, format: FORMATO_MONTO })
const fecha = (iso: string | null) => texto(iso ? iso.replaceAll('-', '') : null)
const negrita = (valor: string) => ({ value: valor, fontWeight: 'bold' as const })
const titulo = (valor: string) => ({
  value: valor, fontWeight: 'bold' as const, textColor: '#FFFFFF', backgroundColor: AZUL, wrap: true, align: 'center' as const, alignVertical: 'center' as const,
})

// Código con su nombre, como en las listas de la herramienta de la DGII.
function codigo(catalogo: readonly OpcionCatalogo[], valor: string | null) {
  if (!valor) return null
  const opcion = catalogo.find(o => o.codigo === valor)
  return texto(opcion ? `${valor} - ${opcion.nombre}` : valor)
}

const incompleto = (e: EntradaExcel) => e.pendientes > 0 || e.conErrores > 0

function nombreArchivo(prefijo: string, e: EntradaExcel): string {
  return `${prefijo}_${e.cliente.rncCedula}_${e.periodo}${incompleto(e) ? '_INCOMPLETO' : ''}.xlsx`
}

function hojaResumen(
  nombreFormato: string,
  e: EntradaExcel,
  registros: number,
  totales: [string, number][],
  conteos: [string, number][] = [],
): HojaExcel {
  return {
    sheet: 'Resumen',
    data: [
      [{ value: nombreFormato, fontWeight: 'bold', fontSize: 14 }],
      [negrita('Contribuyente'), texto(e.cliente.razonSocial)],
      [negrita('RNC o Cédula'), texto(e.cliente.rncCedula)],
      [negrita('Período'), texto(e.periodo)],
      [negrita('Cantidad de registros'), { value: registros, type: Number }],
      ...totales.map(([nombre, valor]) => [negrita(nombre), monto(valor)]),
      ...conteos.map(([nombre, valor]) => [negrita(nombre), { value: valor, type: Number }]),
      [
        negrita('Estado'),
        incompleto(e)
          ? { value: `INCOMPLETO: quedaron fuera ${e.pendientes} factura(s) por revisar y ${e.conErrores} con errores. No usar para declarar.`, textColor: '#B91C1C', fontWeight: 'bold' }
          : { value: 'Completo: incluye todas las facturas del período.' },
      ],
      [],
      [{ value: 'Las notas de crédito (NCF tipo 04) restan en los totales.' }],
    ],
    columns: [{ width: 26 }, { width: 60 }],
    stickyRowsCount: 0,
  }
}

function fila606(d: DocumentoFiscal, formaPagoPorDefecto?: string): SheetData[number] {
  const total = (d.montoServicios ?? 0) + (d.montoBienes ?? 0)
  return [
    texto(d.rncCedulaContraparte),
    texto(d.rncCedulaContraparte?.length === 11 ? '2' : '1'),
    codigo(TIPO_BIENES_SERVICIOS_606, d.tipoBienesServicios),
    texto(d.ncf),
    texto(d.ncfModificado),
    fecha(d.fechaComprobante),
    fecha(d.fechaPago),
    monto(d.montoServicios),
    monto(d.montoBienes),
    monto(total),
    monto(d.itbisFacturado),
    monto(d.itbisRetenido),
    monto(d.itbisProporcionalidad),
    monto(d.itbisLlevadoAlCosto),
    monto((d.itbisFacturado ?? 0) - (d.itbisLlevadoAlCosto ?? 0)),
    null, // ITBIS percibido: no habilitado
    codigo(TIPO_RETENCION_ISR_606, d.tipoRetencionISR),
    monto(d.montoRetencionRenta),
    null, // ISR percibido: no habilitado
    monto(d.impuestoSelectivoConsumo),
    monto(d.otrosImpuestos),
    monto(d.propinaLegal),
    codigo(FORMA_PAGO_606, d.formaPago ?? formaPagoPorDefecto ?? null),
    // ── Referencia (no es parte del formato) ──
    texto(d.nombreContraparte),
    monto(d.montoTotal),
    texto(clasificacionContable(d.tipoBienesServicios)),
  ]
}

// Total de una venta: el impreso si se digitó; si no, lo facturado más sus
// impuestos y la propina (para que una venta sin total no sume cero).
function totalVenta(d: DocumentoFiscal): number {
  return d.montoTotal ?? Math.round(((d.montoFacturado ?? 0) + (d.itbisFacturado ?? 0) + (d.impuestoSelectivoConsumo ?? 0) + (d.otrosImpuestos ?? 0) + (d.propinaLegal ?? 0)) * 100) / 100
}

function filaIngreso(d: DocumentoFiscal): SheetData[number] {
  return [
    // Fecha como texto AAAA-MM-DD: se ordena bien y no depende de zona horaria.
    texto(d.fechaComprobante),
    texto(d.ncf),
    texto(d.ncfModificado),
    texto(d.rncCedulaContraparte),
    texto(d.nombreContraparte),
    codigo(TIPO_INGRESO_607, d.tipoIngreso),
    monto(d.montoFacturado),
    monto(d.itbisFacturado),
    monto(d.impuestoSelectivoConsumo),
    monto(d.otrosImpuestos),
    monto(d.propinaLegal),
    monto(totalVenta(d)),
    monto(d.itbisRetenidoTerceros),
    monto(d.retencionRentaTerceros),
    texto(d.fechaRetencion),
    ...COBROS_607.map(c => monto(d[c])),
  ]
}

// Columnas que el Excel del 606 agrega después de las 23 del formato.
const REFERENCIAS_606 = ['Nombre del proveedor (referencia)', 'Total de la factura (referencia)', 'Clasificación contable (referencia)']

function filaTitulos606(): SheetData[number] {
  return [...TITULOS_606.map((t, i) => titulo(`${i + 1}. ${t}`)), ...REFERENCIAS_606.map(titulo)]
}

// Ancho por columna (en caracteres); `anchas` son las de texto largo
// (códigos con su nombre, nombre de la contraparte).
const anchos = (n: number, anchas: Record<number, number>) =>
  Array.from({ length: n }, (_, i) => ({ width: anchas[i] ?? 18 }))
const porFecha = (a: DocumentoFiscal, b: DocumentoFiscal) =>
  (a.fechaComprobante ?? '').localeCompare(b.fechaComprobante ?? '') || (a.ncf ?? '').localeCompare(b.ncf ?? '')

export function construirExcel606(e: EntradaExcel): LibroExcel {
  const filas = [...e.validas].sort(porFecha)
  // Mismos totales que el TXT (las notas de crédito restan).
  // Sin forma de pago por defecto el TXT no se puede generar, pero el Excel
  // sí: los totales se calculan igual y la columna 23 queda vacía.
  const archivo = filas.length > 0
    ? generar606(e.cliente.rncCedula, e.periodo, filas, { formaPagoPorDefecto: e.formaPagoPorDefecto ?? '01' })
    : null
  return {
    nombreArchivo: nombreArchivo('Formato_606', e),
    hojas: [
      {
        sheet: 'Formato 606',
        data: [filaTitulos606(), ...filas.map(f => fila606(f, e.formaPagoPorDefecto))],
        columns: anchos(TITULOS_606.length + REFERENCIAS_606.length, { 2: 52, 16: 44, 22: 34, 23: 36 }),
        stickyRowsCount: 1,
      },
      hojaResumen('Formato de Envío de Compras de Bienes y Servicios (606)', e, filas.length, [
        ['Total monto facturado', archivo?.totalMontoFacturado ?? 0],
        ['Total ITBIS facturado', archivo?.totalItbisFacturado ?? 0],
      ]),
    ],
  }
}

// Reporte de ingresos: TODAS las ventas válidas del período, sin separar
// las facturas de consumo (eso era una regla del 607, que ya no se envía).
export function construirExcelIngresos(e: EntradaExcel): LibroExcel {
  const filas = [...e.validas].sort(porFecha)
  const suma = (valor: (d: DocumentoFiscal) => number | null) =>
    Math.round(filas.reduce((s, d) => s + (esNotaDeCredito(d) ? -1 : 1) * (valor(d) ?? 0), 0) * 100) / 100
  return {
    nombreArchivo: nombreArchivo('Ingresos', e),
    hojas: [
      {
        sheet: 'Ingresos',
        data: [TITULOS_INGRESOS.map(titulo), ...filas.map(filaIngreso)],
        columns: anchos(TITULOS_INGRESOS.length, { 3: 24, 4: 36, 5: 44 }),
        stickyRowsCount: 1,
      },
      hojaResumen('Reporte de ingresos (uso interno, no se envía a la DGII)', e, filas.length, [
        ['Total monto facturado', suma(d => d.montoFacturado)],
        ['Total ITBIS facturado', suma(d => d.itbisFacturado)],
        ['Total de las facturas', suma(totalVenta)],
      ]),
    ],
  }
}
