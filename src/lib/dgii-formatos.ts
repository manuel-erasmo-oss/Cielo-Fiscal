import { parseFechaLocal, redondear2 } from '@/lib/utils'
import type { CampoExtraido, DocumentoFiscal } from '@/types'

// Formatos de envío 606 (compras) y 607 (ventas) de la DGII: catálogos,
// validaciones y generación del archivo TXT.
//
// FUENTE: las herramientas de envío y los instructivos oficiales entregados
// por el usuario. Especificación completa, versiones y dudas abiertas en
// docs/dgii/formatos-606-607.md. Cada regla de este archivo reproduce una
// regla de la macro de la herramienta o una frase del instructivo; lo que es
// criterio propio (más estricto que la macro) lo dice en su comentario.

export type CamposDocumento = Pick<DocumentoFiscal, CampoExtraido>

// ─── Catálogos (texto de las listas de las herramientas) ─────────────────────

export interface OpcionCatalogo {
  codigo: string
  nombre: string
}

export const TIPO_BIENES_SERVICIOS_606: readonly OpcionCatalogo[] = [
  { codigo: '01', nombre: 'Gastos de personal' },
  { codigo: '02', nombre: 'Gastos por trabajos, suministros y servicios' },
  { codigo: '03', nombre: 'Arrendamientos' },
  { codigo: '04', nombre: 'Gastos de activos fijos' },
  { codigo: '05', nombre: 'Gastos de representación' },
  { codigo: '06', nombre: 'Otras deducciones admitidas' },
  { codigo: '07', nombre: 'Gastos financieros' },
  { codigo: '08', nombre: 'Gastos extraordinarios' },
  { codigo: '09', nombre: 'Compras y gastos que formarán parte del costo de venta' },
  { codigo: '10', nombre: 'Adquisiciones de activos' },
  { codigo: '11', nombre: 'Gastos de seguros' },
]

export const TIPO_RETENCION_ISR_606: readonly OpcionCatalogo[] = [
  { codigo: '01', nombre: 'Alquileres' },
  { codigo: '02', nombre: 'Honorarios por servicios' },
  { codigo: '03', nombre: 'Otras rentas' },
  { codigo: '04', nombre: 'Otras rentas (rentas presuntas)' },
  { codigo: '05', nombre: 'Intereses pagados a personas jurídicas residentes' },
  { codigo: '06', nombre: 'Intereses pagados a personas físicas residentes' },
  { codigo: '07', nombre: 'Retención por proveedores del Estado' },
  { codigo: '08', nombre: 'Juegos telefónicos' },
  { codigo: '09', nombre: 'Retenciones subsector de ganadería de carne bovina' },
]

export const FORMA_PAGO_606: readonly OpcionCatalogo[] = [
  { codigo: '01', nombre: 'Efectivo' },
  { codigo: '02', nombre: 'Cheques / transferencias / depósito' },
  { codigo: '03', nombre: 'Tarjeta crédito / débito' },
  { codigo: '04', nombre: 'Compra a crédito' },
  { codigo: '05', nombre: 'Permuta' },
  { codigo: '06', nombre: 'Nota de crédito' },
  { codigo: '07', nombre: 'Mixto' },
]

// En el 607 el tipo de ingreso va con UN solo dígito.
export const TIPO_INGRESO_607: readonly OpcionCatalogo[] = [
  { codigo: '1', nombre: 'Ingresos por operaciones (no financieros)' },
  { codigo: '2', nombre: 'Ingresos financieros' },
  { codigo: '3', nombre: 'Ingresos extraordinarios' },
  { codigo: '4', nombre: 'Ingresos por arrendamientos' },
  { codigo: '5', nombre: 'Ingresos por venta de activo depreciable' },
  { codigo: '6', nombre: 'Otros ingresos' },
]

export const TIPO_IDENTIFICACION_607: readonly OpcionCatalogo[] = [
  { codigo: '1', nombre: 'RNC' },
  { codigo: '2', nombre: 'Cédula' },
  { codigo: '3', nombre: 'Pasaporte o ID tributaria' },
]

function enCatalogo(catalogo: readonly OpcionCatalogo[], codigo: string | null): boolean {
  return codigo !== null && catalogo.some(o => o.codigo === codigo)
}

// ─── Parámetros ──────────────────────────────────────────────────────────────

// Día del mes siguiente en que vencen el 606 y el 607 (instructivos 606 de
// julio 2025 y 607 de septiembre 2020: "a más tardar el día 15 de cada mes").
export const DIA_LIMITE_606_607 = 15

export const MAXIMO_REGISTROS_606 = 10_000
export const MAXIMO_REGISTROS_607 = 65_000

// Desde julio 2018 (Norma General 10-18) las facturas de consumo por debajo
// de este valor no se detallan en el 607: van como totales en el "Resumen
// General de Facturas de Consumo" de la Oficina Virtual.
export const UMBRAL_CONSUMO_607 = 250_000

export const COBROS_607 = [
  'cobroEfectivo',
  'cobroCheque',
  'cobroTarjeta',
  'cobroCredito',
  'cobroBonos',
  'cobroPermuta',
  'cobroOtras',
] as const satisfies readonly CampoExtraido[]

// ─── NCF ─────────────────────────────────────────────────────────────────────

// Regex de la macro del 606 (versión 2025), ancladas: series A/Q/P de 19
// posiciones (anteriores a mayo 2018), serie B de 11 y serie E (e-CF) de 13.
const NCF_606 = /^(?:[AQP]\d{8}(?:0[1-4]|1[1-5])\d{8}|B(?:0[1-4]|1[1-5]|17)\d{8}|E(?:3[1-4]|4[1-5]|47)\d{10})$/
// Regex de la macro del 607 (versión 2023.1.1). NO admite la serie E.
const NCF_607 = /^(?:[AQP]\d{8}(?:0[1-4]|1[1-5])\d{8}|B(?:0[1-4]|1[1-6])\d{8})$/

export function esNcfValido606(ncf: string): boolean {
  return NCF_606.test(ncf)
}

export function esNcfValido607(ncf: string): boolean {
  return NCF_607.test(ncf)
}

// Tipo de comprobante, igual que `ObtenerTipoNcf` de la macro: con 11
// posiciones los caracteres 2-3, con 19 los 10-11. Con 13 (e-NCF) la macro
// devuelve vacío, así que ninguna regla "por tipo" aplica a un e-NCF.
export function tipoNcf(ncf: string | null): string {
  if (!ncf) return ''
  if (ncf.length === 11) return ncf.slice(1, 3)
  if (ncf.length === 19) return ncf.slice(9, 11)
  return ''
}

const TIPO_CONSUMO = '02'
const TIPO_NOTA_DEBITO = '03'
const TIPO_NOTA_CREDITO = '04'
const TIPO_REGISTRO_UNICO_INGRESOS = '12'
const TIPO_GASTOS_MENORES = '13'
const TIPO_PAGOS_EXTERIOR = '17'

export function esNotaDeCredito(doc: Pick<DocumentoFiscal, 'ncf'>): boolean {
  return tipoNcf(doc.ncf) === TIPO_NOTA_CREDITO
}

// ─── Dígito verificador ──────────────────────────────────────────────────────

// Algoritmo de `GenDV_Para_Republica_Dominicana` de las macros. Devuelve
// null si el identificador no tiene 9 u 11 dígitos. OJO: las propias
// herramientas de la DGII tienen esta comprobación DESACTIVADA, así que aquí
// se usa solo como aviso, nunca para bloquear.
export function digitoVerificadorCorrecto(identificacion: string): boolean | null {
  if (!/^\d+$/.test(identificacion)) return null
  const d = [...identificacion].map(Number)
  if (d.length === 9) {
    const pesos = [7, 9, 8, 6, 5, 4, 3, 2]
    const resto = pesos.reduce((s, p, i) => s + p * d[i], 0) % 11
    const esperado = resto === 0 ? 2 : resto === 1 ? 1 : 11 - resto
    return esperado === d[8]
  }
  if (d.length === 11) {
    let suma = 0
    for (let i = 0; i < 10; i++) {
      const producto = d[i] * (i % 2 === 0 ? 1 : 2)
      suma += Math.floor(producto / 10) + (producto % 10)
    }
    return (10 - (suma % 10)) % 10 === d[10]
  }
  return null
}

// ─── Validación ──────────────────────────────────────────────────────────────

export interface Problema {
  // Campo al que se asocia, para marcarlo en el formulario. null = general.
  campo: CampoExtraido | null
  mensaje: string
  // 'error' impide marcar la factura como revisada y generar el archivo.
  // 'aviso' solo se muestra.
  nivel: 'error' | 'aviso'
}

const err = (campo: CampoExtraido | null, mensaje: string): Problema => ({ campo, mensaje, nivel: 'error' })
const aviso = (campo: CampoExtraido | null, mensaje: string): Problema => ({ campo, mensaje, nivel: 'aviso' })

function fechaValida(iso: string): boolean {
  try {
    const anio = parseFechaLocal(iso).getFullYear()
    return anio >= 1950 && anio <= 2099 // rango de la regex de fecha de la macro
  } catch {
    return false
  }
}

const tieneValor = (n: number | null): n is number => n !== null && n > 0

function validarMontosNoNegativos(doc: CamposDocumento, campos: readonly CampoExtraido[], salida: Problema[]) {
  for (const campo of campos) {
    const valor = doc[campo]
    if (typeof valor === 'number' && (!Number.isFinite(valor) || valor < 0)) {
      salida.push(err(campo, 'Debe ser un monto mayor o igual a 0.'))
    }
  }
}

function validarFechas(
  doc: CamposDocumento,
  obligatoria: CampoExtraido,
  opcional: CampoExtraido,
  salida: Problema[],
) {
  const principal = doc[obligatoria]
  if (typeof principal !== 'string' || !principal) salida.push(err(obligatoria, 'Falta la fecha del comprobante.'))
  else if (!fechaValida(principal)) salida.push(err(obligatoria, 'Fecha inválida.'))
  const otra = doc[opcional]
  if (typeof otra === 'string' && otra && !fechaValida(otra)) salida.push(err(opcional, 'Fecha inválida.'))
}

function avisarDigitoVerificador(identificacion: string, salida: Problema[]) {
  if (digitoVerificadorCorrecto(identificacion) === false) {
    salida.push(aviso('rncCedulaContraparte', 'El dígito verificador no cuadra. Compáralo con la factura.'))
  }
}

// Reglas del Formato 606 para una compra. `rncCliente` es el RNC/cédula del
// cliente del contador (el del encabezado del archivo).
export function validarCompra606(doc: CamposDocumento, rncCliente: string): Problema[] {
  const p: Problema[] = []
  const tipo = tipoNcf(doc.ncf)

  // 1. RNC o cédula del proveedor
  const rnc = doc.rncCedulaContraparte
  if (!rnc) p.push(err('rncCedulaContraparte', 'Falta el RNC o la cédula del proveedor.'))
  else if (!/^\d+$/.test(rnc) || (rnc.length !== 9 && rnc.length !== 11)) {
    p.push(err('rncCedulaContraparte', 'Debe tener 9 dígitos (RNC) u 11 (cédula).'))
  } else {
    // Gastos menores (13) según la macro; pagos al exterior (B17) según el instructivo.
    if ((tipo === TIPO_GASTOS_MENORES || tipo === TIPO_PAGOS_EXTERIOR) && rnc !== rncCliente) {
      p.push(err('rncCedulaContraparte', 'Con este tipo de NCF debe ir el mismo RNC del cliente.'))
    }
    avisarDigitoVerificador(rnc, p)
  }

  // 3. Tipo de bienes y servicios
  if (!doc.tipoBienesServicios) p.push(err('tipoBienesServicios', 'Elige el tipo de bienes y servicios.'))
  else if (!enCatalogo(TIPO_BIENES_SERVICIOS_606, doc.tipoBienesServicios)) {
    p.push(err('tipoBienesServicios', 'Tipo de bienes y servicios no válido.'))
  }

  // 4-5. NCF y NCF modificado
  if (!doc.ncf) p.push(err('ncf', 'Falta el NCF.'))
  else if (!esNcfValido606(doc.ncf)) p.push(err('ncf', 'El NCF no tiene una estructura válida.'))
  if (doc.ncfModificado && !esNcfValido606(doc.ncfModificado)) {
    p.push(err('ncfModificado', 'El NCF modificado no tiene una estructura válida.'))
  }

  // 6-7. Fechas. La de pago es obligatoria si hay retenciones.
  validarFechas(doc, 'fechaComprobante', 'fechaPago', p)
  const hayRetencion = tieneValor(doc.itbisRetenido) || tieneValor(doc.montoRetencionRenta) || !!doc.tipoRetencionISR
  if (hayRetencion && !doc.fechaPago) {
    p.push(err('fechaPago', 'Con retenciones hay que indicar la fecha de pago.'))
  }

  // 8-10. Montos: el total (servicios + bienes) debe ser mayor que 0.
  validarMontosNoNegativos(doc, [
    'montoServicios', 'montoBienes', 'itbisFacturado', 'itbisRetenido', 'itbisProporcionalidad',
    'itbisLlevadoAlCosto', 'montoRetencionRenta', 'impuestoSelectivoConsumo', 'otrosImpuestos', 'propinaLegal',
  ], p)
  if (doc.montoServicios === null && doc.montoBienes === null) {
    p.push(err('montoServicios', 'Indica el monto en servicios, en bienes o en ambos.'))
  } else if ((doc.montoServicios ?? 0) + (doc.montoBienes ?? 0) <= 0) {
    p.push(err('montoServicios', 'El total facturado (servicios + bienes) debe ser mayor que 0.'))
  }

  // 11. ITBIS facturado. Criterio propio, más estricto que la macro (que no
  // lo valida): se exige un valor explícito, aunque sea 0.
  if (doc.itbisFacturado === null) p.push(err('itbisFacturado', 'Indica el ITBIS facturado (0 si no tiene).'))

  // 17. Tipo de retención
  if (doc.tipoRetencionISR && !enCatalogo(TIPO_RETENCION_ISR_606, doc.tipoRetencionISR)) {
    p.push(err('tipoRetencionISR', 'Tipo de retención no válido.'))
  }

  // 23. Forma de pago. La herramienta de la DGII la exige, pero el usuario
  // decidió que NO sea obligatoria al registrar la factura: si falta, se
  // completa al generar el reporte con una forma de pago por defecto (ver
  // `generar606`). Aquí solo se comprueba que, si viene, sea del catálogo.
  if (doc.formaPago && !enCatalogo(FORMA_PAGO_606, doc.formaPago)) p.push(err('formaPago', 'Forma de pago no válida.'))

  return p
}

// Factura de consumo que no se detalla en el 607 (va en el resumen de la
// Oficina Virtual). El umbral se compara contra el monto sin impuestos, que
// es lo que compara la macro.
export function esConsumoBajoUmbral(doc: Pick<DocumentoFiscal, 'ncf' | 'montoFacturado'>): boolean {
  return tipoNcf(doc.ncf) === TIPO_CONSUMO && (doc.montoFacturado ?? 0) < UMBRAL_CONSUMO_607
}

// Reglas del Formato 607 para una venta.
export function validarVenta607(doc: CamposDocumento, rncCliente: string): Problema[] {
  const p: Problema[] = []
  const tipo = tipoNcf(doc.ncf)
  const consumoMenor = esConsumoBajoUmbral(doc)

  // 3-4. NCF
  if (!doc.ncf) p.push(err('ncf', 'Falta el NCF.'))
  else if (doc.ncf.startsWith('E')) {
    p.push(err('ncf', 'La herramienta 607 disponible (versión 2023.1.1) no admite e-NCF (serie E).'))
  } else if (!esNcfValido607(doc.ncf)) p.push(err('ncf', 'El NCF no tiene una estructura válida.'))
  if (doc.ncfModificado && !esNcfValido607(doc.ncfModificado)) {
    p.push(err('ncfModificado', 'El NCF modificado no tiene una estructura válida.'))
  }

  // 6-7. Fechas. La de retención es obligatoria si hubo retenciones.
  validarFechas(doc, 'fechaComprobante', 'fechaRetencion', p)
  if ((tieneValor(doc.itbisRetenidoTerceros) || tieneValor(doc.retencionRentaTerceros)) && !doc.fechaRetencion) {
    p.push(err('fechaRetencion', 'Con retenciones hay que indicar la fecha de retención.'))
  }

  // 8-9. Monto facturado: obligatorio y no menor que el ITBIS.
  validarMontosNoNegativos(doc, [
    'montoFacturado', 'itbisFacturado', 'itbisRetenidoTerceros', 'retencionRentaTerceros',
    'impuestoSelectivoConsumo', 'otrosImpuestos', 'propinaLegal', ...COBROS_607,
  ], p)
  if (doc.montoFacturado === null) p.push(err('montoFacturado', 'Falta el monto facturado.'))
  else if (doc.montoFacturado < (doc.itbisFacturado ?? 0)) {
    p.push(err('montoFacturado', 'El monto facturado no puede ser menor que el ITBIS.'))
  }
  // Criterio propio, igual que en compras: ITBIS explícito aunque sea 0.
  if (doc.itbisFacturado === null) p.push(err('itbisFacturado', 'Indica el ITBIS facturado (0 si no tiene).'))

  // Una factura de consumo por debajo del umbral solo aporta cantidad y
  // monto al resumen: no necesita identificación, tipo de ingreso ni cobros.
  if (consumoMenor) return p

  // 1-2. Identificación del cliente. Excepción de la macro: nota de
  // débito/crédito que modifica una factura de consumo por menos del umbral.
  const exenta =
    (tipo === TIPO_NOTA_DEBITO || tipo === TIPO_NOTA_CREDITO) &&
    tipoNcf(doc.ncfModificado) === TIPO_CONSUMO &&
    (doc.montoFacturado ?? 0) < UMBRAL_CONSUMO_607
  const id = doc.rncCedulaContraparte
  if (!exenta || id) {
    if (!id) p.push(err('rncCedulaContraparte', 'Falta la identificación del cliente.'))
    if (!doc.tipoIdentificacion) p.push(err('tipoIdentificacion', 'Elige el tipo de identificación.'))
    else if (!enCatalogo(TIPO_IDENTIFICACION_607, doc.tipoIdentificacion)) {
      p.push(err('tipoIdentificacion', 'Tipo de identificación no válido.'))
    } else if (id && doc.tipoIdentificacion !== '3') {
      const largo = doc.tipoIdentificacion === '1' ? 9 : 11
      if (!/^\d+$/.test(id) || id.length !== largo) {
        p.push(err('rncCedulaContraparte', `Debe tener ${largo} dígitos.`))
      } else if (id === '00000000000') {
        p.push(err('rncCedulaContraparte', 'Cédula no válida.'))
      } else {
        avisarDigitoVerificador(id, p)
      }
    }
    if (id && tipo === TIPO_REGISTRO_UNICO_INGRESOS && id !== rncCliente) {
      p.push(err('rncCedulaContraparte', 'Con este tipo de NCF debe ir el mismo RNC del cliente.'))
    }
  }

  // 5. Tipo de ingreso
  if (!doc.tipoIngreso) p.push(err('tipoIngreso', 'Elige el tipo de ingreso.'))
  else if (!enCatalogo(TIPO_INGRESO_607, doc.tipoIngreso)) p.push(err('tipoIngreso', 'Tipo de ingreso no válido.'))

  // 17-23. Formas de cobro: al menos una con valor, salvo notas de crédito.
  const cobrado = redondear2(COBROS_607.reduce((s, c) => s + (doc[c] ?? 0), 0))
  if (cobrado === 0 && tipo !== TIPO_NOTA_CREDITO) {
    p.push(err('cobroEfectivo', 'Indica cómo se cobró: al menos una forma de cobro debe tener monto.'))
  } else if (cobrado > 0 && doc.montoTotal !== null && Math.abs(cobrado - doc.montoTotal) > 0.01) {
    // El instructivo pide que la suma sea igual al total; la macro no lo comprueba.
    p.push(aviso('cobroEfectivo', 'La suma de las formas de cobro no coincide con el total de la factura.'))
  }

  return p
}

// ─── Generación del archivo ──────────────────────────────────────────────────

export interface ArchivoDGII {
  nombreArchivo: string
  // Contenido exacto a enviar: líneas separadas por CRLF, sin salto final.
  contenido: string
  registros: number
  // Informativos (las notas de crédito restan), como los calcula la macro.
  totalMontoFacturado: number
  totalItbisFacturado: number
}

export interface ResumenConsumo607 {
  // Facturas de consumo por debajo del umbral: no van en el archivo, se
  // digitan como totales en la Oficina Virtual.
  cantidad: number
  montoFacturado: number
  itbisFacturado: number
}

const PERIODO_RE = /^(20\d{2})(0[1-9]|1[0-2])$/

function exigirEncabezado(rnc: string, periodo: string, registros: number, maximo: number) {
  if (!/^\d{9}$|^\d{11}$/.test(rnc)) throw new Error('El RNC o cédula del cliente debe tener 9 u 11 dígitos.')
  if (!PERIODO_RE.test(periodo) || periodo < '201805') {
    throw new Error('El período debe tener la forma AAAAMM y ser mayo 2018 o posterior.')
  }
  if (registros < 1) throw new Error('No hay comprobantes para generar el archivo.')
  if (registros > maximo) throw new Error(`El formato admite como máximo ${maximo} registros.`)
}

const monto = (n: number | null) => (n === null ? '' : n.toFixed(2))
const fecha = (iso: string | null) => (iso ? iso.replaceAll('-', '') : '')
const texto = (s: string | null) => s ?? ''
const signo = (doc: Pick<DocumentoFiscal, 'ncf'>) => (esNotaDeCredito(doc) ? -1 : 1)

// `formaPagoPorDefecto` se usa solo si la factura no trae forma de pago.
export function linea606(doc: CamposDocumento, formaPagoPorDefecto?: string): string {
  const total = (doc.montoServicios ?? 0) + (doc.montoBienes ?? 0)
  const itbisPorAdelantar = (doc.itbisFacturado ?? 0) - (doc.itbisLlevadoAlCosto ?? 0)
  return [
    texto(doc.rncCedulaContraparte),              //  1 RNC o cédula
    doc.rncCedulaContraparte?.length === 11 ? '2' : '1', //  2 Tipo Id
    texto(doc.tipoBienesServicios),               //  3 Tipo de bienes y servicios
    texto(doc.ncf),                               //  4 NCF
    texto(doc.ncfModificado),                     //  5 NCF modificado
    fecha(doc.fechaComprobante),                  //  6 Fecha comprobante
    fecha(doc.fechaPago),                         //  7 Fecha pago
    monto(doc.montoServicios),                    //  8 Monto en servicios
    monto(doc.montoBienes),                       //  9 Monto en bienes
    total.toFixed(2),                             // 10 Total monto facturado
    monto(doc.itbisFacturado),                    // 11 ITBIS facturado
    monto(doc.itbisRetenido),                     // 12 ITBIS retenido
    monto(doc.itbisProporcionalidad),             // 13 ITBIS sujeto a proporcionalidad
    monto(doc.itbisLlevadoAlCosto),               // 14 ITBIS llevado al costo
    itbisPorAdelantar.toFixed(2),                 // 15 ITBIS por adelantar
    '',                                           // 16 ITBIS percibido (no habilitado)
    texto(doc.tipoRetencionISR),                  // 17 Tipo de retención en ISR
    monto(doc.montoRetencionRenta),               // 18 Monto retención renta
    '',                                           // 19 ISR percibido (no habilitado)
    monto(doc.impuestoSelectivoConsumo),          // 20 Impuesto selectivo al consumo
    monto(doc.otrosImpuestos),                    // 21 Otros impuestos/tasas
    monto(doc.propinaLegal),                      // 22 Propina legal
    texto(doc.formaPago ?? formaPagoPorDefecto ?? null), // 23 Forma de pago
  ].join('|')
}

export function linea607(doc: CamposDocumento): string {
  return [
    texto(doc.rncCedulaContraparte),              //  1 RNC, cédula o pasaporte
    texto(doc.tipoIdentificacion),                //  2 Tipo identificación
    texto(doc.ncf),                               //  3 NCF
    texto(doc.ncfModificado),                     //  4 NCF modificado
    texto(doc.tipoIngreso),                       //  5 Tipo de ingreso
    fecha(doc.fechaComprobante),                  //  6 Fecha comprobante
    fecha(doc.fechaRetencion),                    //  7 Fecha de retención
    monto(doc.montoFacturado),                    //  8 Monto facturado
    monto(doc.itbisFacturado),                    //  9 ITBIS facturado
    monto(doc.itbisRetenidoTerceros),             // 10 ITBIS retenido por terceros
    '',                                           // 11 ITBIS percibido (no habilitado)
    monto(doc.retencionRentaTerceros),            // 12 Retención renta por terceros
    '',                                           // 13 ISR percibido (no habilitado)
    monto(doc.impuestoSelectivoConsumo),          // 14 Impuesto selectivo al consumo
    monto(doc.otrosImpuestos),                    // 15 Otros impuestos/tasas
    monto(doc.propinaLegal),                      // 16 Propina legal
    ...COBROS_607.map(c => monto(doc[c])),        // 17-23 Formas de cobro
  ].join('|')
}

export interface Opciones606 {
  // Código del catálogo de forma de pago para las compras que no la indican.
  formaPagoPorDefecto?: string
}

export function comprasSinFormaPago(compras: readonly CamposDocumento[]): number {
  return compras.filter(c => !c.formaPago).length
}

// `periodo` en formato AAAAMM. `compras` deben venir ya filtradas (del
// período, revisadas y sin errores): aquí no se valida fila por fila.
export function generar606(
  rncCliente: string,
  periodo: string,
  compras: readonly CamposDocumento[],
  opciones: Opciones606 = {},
): ArchivoDGII {
  exigirEncabezado(rncCliente, periodo, compras.length, MAXIMO_REGISTROS_606)
  const { formaPagoPorDefecto } = opciones
  if (formaPagoPorDefecto !== undefined && !enCatalogo(FORMA_PAGO_606, formaPagoPorDefecto)) {
    throw new Error('La forma de pago por defecto no es válida.')
  }
  const sinForma = comprasSinFormaPago(compras)
  if (sinForma > 0 && !formaPagoPorDefecto) {
    throw new Error(`Hay ${sinForma} compra(s) sin forma de pago y el formato de la DGII la exige. Elige una forma de pago por defecto.`)
  }
  const lineas = [`606|${rncCliente}|${periodo}|${compras.length}`, ...compras.map(c => linea606(c, formaPagoPorDefecto))]
  return {
    nombreArchivo: `DGII_F_606_${rncCliente}_${periodo}.TXT`,
    contenido: lineas.join('\r\n'),
    registros: compras.length,
    totalMontoFacturado: redondear2(
      compras.reduce((s, d) => s + signo(d) * ((d.montoServicios ?? 0) + (d.montoBienes ?? 0)), 0),
    ),
    totalItbisFacturado: redondear2(compras.reduce((s, d) => s + signo(d) * (d.itbisFacturado ?? 0), 0)),
  }
}

// Separa las ventas del período en las que van detalladas en el archivo y
// las facturas de consumo que solo van como totales.
export function separarVentas607<T extends CamposDocumento>(ventas: readonly T[]): {
  detalladas: T[]
  resumenConsumo: ResumenConsumo607
} {
  const detalladas = ventas.filter(v => !esConsumoBajoUmbral(v))
  const menores = ventas.filter(esConsumoBajoUmbral)
  return {
    detalladas,
    resumenConsumo: {
      cantidad: menores.length,
      montoFacturado: redondear2(menores.reduce((s, d) => s + (d.montoFacturado ?? 0), 0)),
      itbisFacturado: redondear2(menores.reduce((s, d) => s + (d.itbisFacturado ?? 0), 0)),
    },
  }
}

// `ventas`: solo las que van detalladas (ver `separarVentas607`).
export function generar607(rncCliente: string, periodo: string, ventas: readonly CamposDocumento[]): ArchivoDGII {
  exigirEncabezado(rncCliente, periodo, ventas.length, MAXIMO_REGISTROS_607)
  const lineas = [`607|${rncCliente}|${periodo}|${ventas.length}`, ...ventas.map(linea607)]
  return {
    nombreArchivo: `DGII_F_607_${rncCliente}_${periodo}.txt`,
    contenido: lineas.join('\r\n'),
    registros: ventas.length,
    totalMontoFacturado: redondear2(ventas.reduce((s, d) => s + signo(d) * (d.montoFacturado ?? 0), 0)),
    totalItbisFacturado: redondear2(ventas.reduce((s, d) => s + signo(d) * (d.itbisFacturado ?? 0), 0)),
  }
}
