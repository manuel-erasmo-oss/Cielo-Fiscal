import type { SheetData } from 'write-excel-file/browser'
import {
  COBROS_607,
  FORMA_PAGO_606,
  TIPO_BIENES_SERVICIOS_606,
  TIPO_INGRESO_607,
  TIPO_RETENCION_ISR_606,
  generar606,
  generar607,
  separarVentas607,
  type OpcionCatalogo,
} from '@/lib/dgii-formatos'
import type { ClienteFiscal, DocumentoFiscal } from '@/types'

// Exportación del reporte 606/607 a Excel. Es un papel de trabajo para el
// contador (revisar, filtrar, archivar): lo que se envía a la DGII sigue
// siendo el TXT. La primera hoja es una tabla limpia (títulos en la fila 1)
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

export const TITULOS_607 = [
  'RNC/Cédula o Pasaporte', 'Tipo Identificación', 'Número Comprobante Fiscal',
  'Número Comprobante Fiscal Modificado', 'Tipo de Ingreso', 'Fecha Comprobante', 'Fecha de Retención',
  'Monto Facturado', 'ITBIS Facturado', 'ITBIS Retenido por Terceros', 'ITBIS Percibido',
  'Retención Renta por Terceros', 'ISR Percibido', 'Impuesto Selectivo al Consumo', 'Otros Impuestos/Tasas',
  'Monto Propina Legal', 'Efectivo', 'Cheque/ Transferencia/ Depósito', 'Tarjeta Débito/Crédito',
  'Venta a Crédito', 'Bonos o Certificados de Regalo', 'Permuta', 'Otras Formas de Ventas',
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

function nombreArchivo(formato: string, e: EntradaExcel): string {
  return `Formato_${formato}_${e.cliente.rncCedula}_${e.periodo}${incompleto(e) ? '_INCOMPLETO' : ''}.xlsx`
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
      [{ value: 'Las notas de crédito restan en los totales. El archivo que se envía a la DGII es el TXT, no este Excel.' }],
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
  ]
}

function fila607(d: DocumentoFiscal): SheetData[number] {
  return [
    texto(d.rncCedulaContraparte),
    texto(d.tipoIdentificacion),
    texto(d.ncf),
    texto(d.ncfModificado),
    codigo(TIPO_INGRESO_607, d.tipoIngreso),
    fecha(d.fechaComprobante),
    fecha(d.fechaRetencion),
    monto(d.montoFacturado),
    monto(d.itbisFacturado),
    monto(d.itbisRetenidoTerceros),
    null, // ITBIS percibido: no habilitado
    monto(d.retencionRentaTerceros),
    null, // ISR percibido: no habilitado
    monto(d.impuestoSelectivoConsumo),
    monto(d.otrosImpuestos),
    monto(d.propinaLegal),
    ...COBROS_607.map(c => monto(d[c])),
    // ── Referencia (no es parte del formato) ──
    texto(d.nombreContraparte),
    monto(d.montoTotal),
  ]
}

function filaTitulos(titulos: readonly string[], contraparte: string): SheetData[number] {
  return [
    ...titulos.map((t, i) => titulo(`${i + 1}. ${t}`)),
    titulo(`Nombre del ${contraparte} (referencia)`),
    titulo('Total de la factura (referencia)'),
  ]
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
    nombreArchivo: nombreArchivo('606', e),
    hojas: [
      {
        sheet: 'Formato 606',
        data: [filaTitulos(TITULOS_606, 'proveedor'), ...filas.map(f => fila606(f, e.formaPagoPorDefecto))],
        columns: anchos(TITULOS_606.length + 2, { 2: 52, 16: 44, 22: 34, 23: 36 }),
        stickyRowsCount: 1,
      },
      hojaResumen('Formato de Envío de Compras de Bienes y Servicios (606)', e, filas.length, [
        ['Total monto facturado', archivo?.totalMontoFacturado ?? 0],
        ['Total ITBIS facturado', archivo?.totalItbisFacturado ?? 0],
      ]),
    ],
  }
}

export function construirExcel607(e: EntradaExcel): LibroExcel {
  const { detalladas, resumenConsumo } = separarVentas607([...e.validas].sort(porFecha))
  const consumo = [...e.validas].filter(v => !detalladas.includes(v)).sort(porFecha)
  const archivo = detalladas.length > 0 ? generar607(e.cliente.rncCedula, e.periodo, detalladas) : null
  return {
    nombreArchivo: nombreArchivo('607', e),
    hojas: [
      {
        sheet: 'Formato 607',
        data: [filaTitulos(TITULOS_607, 'cliente'), ...detalladas.map(fila607)],
        columns: anchos(TITULOS_607.length + 2, { 0: 22, 4: 44, 23: 36 }),
        stickyRowsCount: 1,
      },
      hojaResumen('Formato de Envío de Ventas de Bienes y Servicios (607)', e, detalladas.length, [
        ['Total monto facturado', archivo?.totalMontoFacturado ?? 0],
        ['Total ITBIS facturado', archivo?.totalItbisFacturado ?? 0],
        // Lo que se digita en el "Resumen General de Facturas de Consumo" de la Oficina Virtual.
        ['Facturas de consumo: monto facturado', resumenConsumo.montoFacturado],
        ['Facturas de consumo: ITBIS facturado', resumenConsumo.itbisFacturado],
      ], [['Facturas de consumo: cantidad', resumenConsumo.cantidad]]),
      {
        sheet: 'Facturas de consumo',
        data: [
          ['NCF', 'Fecha Comprobante', 'Monto Facturado', 'ITBIS Facturado', 'Total de la factura'].map(titulo),
          ...consumo.map(d => [texto(d.ncf), fecha(d.fechaComprobante), monto(d.montoFacturado), monto(d.itbisFacturado), monto(d.montoTotal)]),
        ],
        columns: Array.from({ length: 5 }, () => ({ width: 24 })),
        stickyRowsCount: 1,
      },
    ],
  }
}
