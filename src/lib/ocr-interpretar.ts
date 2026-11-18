import { CAMPOS_EXTRAIDOS, CAMPOS_VACIOS } from '@/lib/documentos'
import { loEmiteElComprador, vaConRncDelCliente } from '@/lib/dgii-formatos'
import type { ResultadoOCR } from '@/lib/ocr-tipos'
import { parseFechaLocal, redondear2, soloDigitos } from '@/lib/utils'
import type { CampoExtraido, TipoDocumento } from '@/types'

// De lo que devuelve el modelo a lo que usa la aplicación. Lógica pura (sin
// red ni servidor) para poder probarla: aquí se decide si la factura es una
// compra o una venta del cliente, quién es la contraparte y qué campos
// quedan marcados como dudosos.

// Campos que el modelo devuelve. Los nombres se le muestran en el prompt y
// son los que puede listar en `camposDudosos`.
export const CAMPOS_MODELO = [
  'rncEmisor',
  'nombreEmisor',
  'rncComprador',
  'nombreComprador',
  'ncf',
  'ncfModificado',
  'fechaComprobante',
  'fechaPago',
  'montoSinImpuestos',
  'montoServicios',
  'montoBienes',
  'itbisFacturado',
  'impuestoSelectivoConsumo',
  'otrosImpuestos',
  'propinaLegal',
  'montoTotal',
  'formaPago',
  'tipoBienesServicios',
] as const
export type CampoModelo = (typeof CAMPOS_MODELO)[number]

export interface LecturaModelo {
  esComprobanteFiscal: boolean
  rncEmisor: string | null
  nombreEmisor: string | null
  rncComprador: string | null
  nombreComprador: string | null
  ncf: string | null
  ncfModificado: string | null
  fechaComprobante: string | null
  fechaPago: string | null
  montoSinImpuestos: number | null
  montoServicios: number | null
  montoBienes: number | null
  itbisFacturado: number | null
  impuestoSelectivoConsumo: number | null
  otrosImpuestos: number | null
  propinaLegal: number | null
  montoTotal: number | null
  formaPago: string | null
  tipoBienesServicios: string | null
  camposDudosos: CampoModelo[]
  confianza: number
}

export interface ContextoLectura {
  // Tipo que se usa cuando la factura no deja saber si es compra o venta.
  tipoPorDefecto: TipoDocumento
  // RNC o cédula del cliente del contador (solo dígitos), si se conoce.
  rncCliente: string | null
}

// "YYYY-MM-DD" válido o null — vía parseFechaLocal, nunca new Date(iso).
function fecha(valor: string | null): string | null {
  if (valor === null) return null
  try {
    parseFechaLocal(valor)
    return valor
  } catch {
    return null
  }
}

function monto(valor: number | null): number | null {
  if (valor === null || !Number.isFinite(valor) || valor < 0) return null
  return redondear2(valor)
}

function texto(valor: string | null): string | null {
  const limpio = valor?.trim()
  return limpio ? limpio : null
}

function identificacion(valor: string | null): string | null {
  return valor === null ? null : soloDigitos(valor) || null
}

const ncf = (valor: string | null) => texto(valor)?.replace(/\s+/g, '').toUpperCase() ?? null

export function interpretarLectura(crudo: LecturaModelo, ctx: ContextoLectura): ResultadoOCR {
  const confianzaOCR = Number.isFinite(crudo.confianza) ? Math.min(1, Math.max(0, crudo.confianza)) : 0
  if (!crudo.esComprobanteFiscal) {
    return {
      esComprobante: false, tipo: ctx.tipoPorDefecto, coincideCliente: null,
      extraccion: { ...CAMPOS_VACIOS }, confianzaOCR, camposDudosos: [],
    }
  }

  // Lo que no pasa la validación queda en null, igual que si el modelo no lo
  // hubiera leído: va a revisión, no se corrige a ciegas.
  const leido = {
    rncEmisor: identificacion(crudo.rncEmisor),
    nombreEmisor: texto(crudo.nombreEmisor),
    rncComprador: identificacion(crudo.rncComprador),
    nombreComprador: texto(crudo.nombreComprador),
    ncf: ncf(crudo.ncf),
    ncfModificado: ncf(crudo.ncfModificado),
    fechaComprobante: fecha(crudo.fechaComprobante),
    fechaPago: fecha(crudo.fechaPago),
    montoSinImpuestos: monto(crudo.montoSinImpuestos),
    montoServicios: monto(crudo.montoServicios),
    montoBienes: monto(crudo.montoBienes),
    itbisFacturado: monto(crudo.itbisFacturado),
    impuestoSelectivoConsumo: monto(crudo.impuestoSelectivoConsumo),
    otrosImpuestos: monto(crudo.otrosImpuestos),
    propinaLegal: monto(crudo.propinaLegal),
    montoTotal: monto(crudo.montoTotal),
    formaPago: crudo.formaPago,
    tipoBienesServicios: crudo.tipoBienesServicios,
  } satisfies Record<CampoModelo, string | number | null>

  const dudososModelo = new Set<CampoModelo>(crudo.camposDudosos)
  // Un valor que el modelo devolvió pero no pasó la validación también es dudoso.
  for (const campo of CAMPOS_MODELO) {
    if (crudo[campo] !== null && leido[campo] === null) dudososModelo.add(campo)
  }

  // ¿Compra o venta? Lo dice quién es el cliente en la factura: si la emitió,
  // es una venta suya; si aparece como comprador, es una compra suya.
  // Excepción: los comprobantes de compras (11/41), gastos menores (13/43) y
  // pagos al exterior (17/47) los emite el propio comprador (Guía de NCF de
  // la DGII), así que con el cliente como emisor siguen siendo compras.
  let tipo = ctx.tipoPorDefecto
  let coincideCliente: boolean | null = null
  let autoemitido = false
  if (ctx.rncCliente) {
    if (leido.rncEmisor === ctx.rncCliente) {
      autoemitido = loEmiteElComprador(leido.ncf)
      tipo = autoemitido ? 'compra' : 'venta'
      coincideCliente = true
    } else if (leido.rncComprador === ctx.rncCliente) {
      tipo = 'compra'
      coincideCliente = true
    } else if (leido.rncEmisor && leido.rncComprador) {
      // Se leyeron los dos RNC y ninguno es el del cliente.
      coincideCliente = false
    }
  }

  const esCompra = tipo === 'compra'
  // Dónde está la contraparte en la factura: el emisor en una compra normal,
  // el comprador en una venta y en un comprobante de compras autoemitido
  // (allí figura el vendedor). En gastos menores y pagos al exterior el 606
  // lleva el RNC del propio cliente (ver `vaConRncDelCliente`).
  const conRncPropio = autoemitido && vaConRncDelCliente(leido.ncf)
  const lado: 'Emisor' | 'Comprador' = esCompra && !autoemitido ? 'Emisor' : 'Comprador'
  const rncContraparte = conRncPropio ? ctx.rncCliente : leido[`rnc${lado}`]
  const dudosos = new Set<CampoExtraido>()
  const marcar = (campoModelo: CampoModelo, campo: CampoExtraido) => {
    if (dudososModelo.has(campoModelo)) dudosos.add(campo)
  }
  if (!conRncPropio) marcar(`rnc${lado}`, 'rncCedulaContraparte')
  marcar(`nombre${lado}`, 'nombreContraparte')
  for (const campo of ['ncf', 'ncfModificado', 'fechaComprobante', 'itbisFacturado', 'impuestoSelectivoConsumo', 'otrosImpuestos', 'propinaLegal', 'montoTotal'] as const) {
    marcar(campo, campo)
  }
  // El RNC del cliente no apareció donde debía: la contraparte queda en duda.
  if (coincideCliente === false) dudosos.add('rncCedulaContraparte')

  const comunes = {
    rncCedulaContraparte: rncContraparte,
    nombreContraparte: leido[`nombre${lado}`],
    ncf: leido.ncf,
    ncfModificado: leido.ncfModificado,
    fechaComprobante: leido.fechaComprobante,
    itbisFacturado: leido.itbisFacturado,
    impuestoSelectivoConsumo: leido.impuestoSelectivoConsumo,
    otrosImpuestos: leido.otrosImpuestos,
    propinaLegal: leido.propinaLegal,
    montoTotal: leido.montoTotal,
  }

  let extraccion: ResultadoOCR['extraccion']
  if (esCompra) {
    extraccion = {
      ...CAMPOS_VACIOS,
      ...comunes,
      fechaPago: leido.fechaPago,
      montoServicios: leido.montoServicios,
      montoBienes: leido.montoBienes,
      formaPago: leido.formaPago,
      tipoBienesServicios: leido.tipoBienesServicios,
    }
    marcar('tipoBienesServicios', 'tipoBienesServicios')
    marcar('fechaPago', 'fechaPago')
    marcar('formaPago', 'formaPago')
    // El reparto es dudoso si el modelo lo dijo, o si no suma el subtotal impreso.
    const reparto = (leido.montoServicios ?? 0) + (leido.montoBienes ?? 0)
    const noCuadra =
      leido.montoSinImpuestos !== null &&
      (leido.montoServicios !== null || leido.montoBienes !== null) &&
      Math.abs(reparto - leido.montoSinImpuestos) > 0.01
    if (noCuadra || dudososModelo.has('montoServicios') || dudososModelo.has('montoBienes') || dudososModelo.has('montoSinImpuestos')) {
      dudosos.add('montoServicios')
      dudosos.add('montoBienes')
    }
  } else {
    extraccion = {
      ...CAMPOS_VACIOS,
      ...comunes,
      montoFacturado: leido.montoSinImpuestos,
      // Mismo criterio que la herramienta de la DGII: 9 dígitos = RNC, 11 = cédula.
      tipoIdentificacion: rncContraparte?.length === 9 ? '1' : rncContraparte?.length === 11 ? '2' : null,
    }
    marcar('montoSinImpuestos', 'montoFacturado')
  }

  return {
    esComprobante: true,
    tipo,
    coincideCliente,
    extraccion,
    confianzaOCR,
    camposDudosos: CAMPOS_EXTRAIDOS.filter(c => dudosos.has(c)),
  }
}
