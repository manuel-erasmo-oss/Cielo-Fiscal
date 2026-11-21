import { describe, expect, it } from 'vitest'
import { CAMPOS_VACIOS } from '@/lib/documentos'
import { aplicarVerificacion, documentoDesdePagina, interpretarPagina, observaciones, type ContextoLote } from '@/lib/lote/borrador'
import { esAprobable } from '@/lib/comprobantes'
import type { ResultadoOCR } from '@/lib/ocr-tipos'
import { MODELO_OCR_POR_DEFECTO, MODELO_OCR_RELECTURA } from '@/lib/ocr-modelos'
import { MOTIVO_YA_AGOTADA, NOTA_CAPTURA_MANUAL, aplicarResultado, huellaDe, leerEscalonado, marcarCapturaManual, motivosRelectura } from './lectura-escalonada'

const CLIENTE = { id: 'c1', rncCedula: '401007551' }
const ctx = (cambios: Partial<ContextoLote> = {}): ContextoLote => ({ cliente: CLIENTE, tipoPorDefecto: 'compra', existentes: [], ...cambios })
const QR = 'https://ecf.dgii.gov.do/ecf/ConsultaTimbre?RncEmisor=101123451&RncComprador=401007551&ENCF=E310000007629&FechaEmision=01-07-2026&MontoTotal=1180.00&CodigoSeguridad=x'

// Una compra bien leída: cuadra, RNC con dígito verificador correcto, todo lo obligatorio.
const buena = (campos: Partial<ResultadoOCR['extraccion']> = {}, resto: Partial<ResultadoOCR> = {}): ResultadoOCR => ({
  esComprobante: true, tipo: 'compra', coincideCliente: true, confianzaOCR: 0.9, camposDudosos: [],
  extraccion: { ...CAMPOS_VACIOS, rncCedulaContraparte: '101123451', nombreContraparte: 'PROVEEDOR SRL', ncf: 'B0100000123', fechaComprobante: '2026-07-01', montoServicios: 0, montoBienes: 1000, itbisFacturado: 180, montoTotal: 1180, tipoBienesServicios: '09', ...campos },
  ...resto,
})

describe('motivosRelectura', () => {
  const sinQr = interpretarPagina(null, ctx())

  it('una lectura correcta pasa (sin motivos)', () => {
    expect(motivosRelectura(sinQr, buena(), ctx(), CLIENTE.rncCedula)).toEqual([])
  })

  it('montos que no suman el total → relectura', () => {
    expect(motivosRelectura(sinQr, buena({ montoTotal: 1500 }), ctx(), CLIENTE.rncCedula)).toContain('Los montos no suman el total de la factura.')
  })

  it('RNC con dígito verificador malo → relectura', () => {
    const m = motivosRelectura(sinQr, buena({ rncCedulaContraparte: '101123452' }), ctx(), CLIENTE.rncCedula)
    expect(m).toContain('El dígito verificador del RNC o la cédula no cuadra.')
  })

  it('campo obligatorio vacío (tipo de bienes del 606) → relectura', () => {
    const m = motivosRelectura(sinQr, buena({ tipoBienesServicios: null }), ctx(), CLIENTE.rncCedula)
    expect(m.some(x => x.startsWith('Tipo de bienes'))).toBe(true)
  })

  it('con QR: un NCF o un total distinto al firmado → relectura; igual salvo formato → pasa', () => {
    const conQr = interpretarPagina(QR, ctx())
    const m = motivosRelectura(conQr, buena({ ncf: 'E310000007628', montoTotal: 1180 }), ctx(), CLIENTE.rncCedula)
    expect(m).toContain('NCF leído distinto al del código QR.')
    expect(motivosRelectura(conQr, buena({ ncf: 'e31-0000007629' }), ctx(), CLIENTE.rncCedula)).toEqual([])
  })

  it('con QR: la IA entiende la factura al revés → relectura', () => {
    const conQr = interpretarPagina(QR, ctx())
    expect(motivosRelectura(conQr, buena({}, { tipo: 'venta' }), ctx(), CLIENTE.rncCedula)).toContain('La lectura no coincide con el código QR de la factura.')
  })

  it('lo que no se guarda (no es factura, otro módulo) no se relee', () => {
    expect(motivosRelectura(sinQr, buena({}, { esComprobante: false }), ctx(), CLIENTE.rncCedula)).toEqual([])
    expect(motivosRelectura(sinQr, buena({}, { tipo: 'venta' }), ctx({ tipoModulo: 'compra' }), CLIENTE.rncCedula)).toEqual([])
  })

  it('el ITBIS que da la DGII manda: si con él cuadra, no hay relectura', () => {
    const conQr = aplicarVerificacion(interpretarPagina(QR, ctx()), { estado: 'aceptado', texto: 'Aceptado', datos: { rncEmisor: '101123451', razonSocialEmisor: 'PROVEEDOR SRL', rncComprador: '401007551', razonSocialComprador: 'CLIENTE', totalItbis: 180 } } as never, '2026-11-21T00:00:00Z')
    expect(motivosRelectura(conQr, buena({ ncf: 'E310000007629', itbisFacturado: 999 }), ctx(), CLIENTE.rncCedula)).toEqual([])
  })
})

describe('leerEscalonado', () => {
  const fatal = (e: unknown) => e instanceof Error && e.message === 'fatal'

  it('Haiku pasa: una sola llamada, sin relectura', async () => {
    const llamadas: string[] = []
    const r = await leerEscalonado(async m => { llamadas.push(m); return buena() }, () => [], fatal)
    expect(llamadas).toEqual([MODELO_OCR_POR_DEFECTO])
    expect(r).toMatchObject({ modelo: MODELO_OCR_POR_DEFECTO, releida: false, manual: false })
  })

  it('Haiku falla las validaciones y Sonnet pasa: dos llamadas, queda la de Sonnet', async () => {
    const llamadas: string[] = []
    const r = await leerEscalonado(
      async m => { llamadas.push(m); return m === MODELO_OCR_POR_DEFECTO ? buena({ montoTotal: 9 }) : buena() },
      l => (l.extraccion.montoTotal === 9 ? ['no cuadra'] : []),
      fatal,
    )
    expect(llamadas).toEqual([MODELO_OCR_POR_DEFECTO, MODELO_OCR_RELECTURA])
    expect(r).toMatchObject({ modelo: MODELO_OCR_RELECTURA, releida: true, manual: false, motivos: [] })
  })

  it('los dos fallan: captura manual, y nunca hay una tercera llamada', async () => {
    const llamadas: string[] = []
    const r = await leerEscalonado(async m => { llamadas.push(m); return buena({ montoTotal: 9 }) }, () => ['no cuadra'], fatal)
    expect(llamadas).toHaveLength(2)
    expect(r).toMatchObject({ modelo: MODELO_OCR_RELECTURA, releida: true, manual: true, motivos: ['no cuadra'] })
  })

  it('Haiku da error de servicio y Sonnet también: manual con los dos motivos', async () => {
    const r = await leerEscalonado(async () => { throw new Error('se cayó') }, () => [], fatal)
    expect(r.manual).toBe(true)
    expect(r.lectura).toBeNull()
    expect(r.motivos).toEqual(['La lectura con Haiku 5.5 falló: se cayó', 'La relectura con Sonnet 5.5 falló: se cayó'])
  })

  it('un error fatal (código de acceso, IA no configurada) se relanza: la página queda sin leer', async () => {
    await expect(leerEscalonado(async () => { throw new Error('fatal') }, () => [], fatal)).rejects.toThrow('fatal')
  })
})

describe('captura manual', () => {
  it('marca en duda todo lo que lee la IA salvo lo exacto del QR, y no se aprueba en bloque', () => {
    const conQr = interpretarPagina(QR, ctx())
    const r = { lectura: buena({ montoTotal: 9 }), modelo: MODELO_OCR_RELECTURA, releida: true, manual: true, motivos: ['no cuadra'] }
    const b = aplicarResultado(conQr, r, ctx())
    expect(b.nota).toBe(NOTA_CAPTURA_MANUAL)
    expect(b.lecturaIA).toEqual({ modelo: MODELO_OCR_RELECTURA, releida: true, manual: true, motivos: ['no cuadra'] })
    expect(b.dudosos).toEqual(expect.arrayContaining(['montoBienes', 'itbisFacturado', 'tipoBienesServicios', 'nombreContraparte']))
    expect(b.dudosos).not.toContain('ncf') // lo firmó el emisor
    expect(observaciones(b, CLIENTE.rncCedula).length).toBeGreaterThan(0)
    const doc = documentoDesdePagina('d1', { ...b, huella: 'abc' }, CLIENTE, { nombre: 'a.pdf', pagina: 1 }, '2026-11-21T00:00:00Z')
    expect(doc.lecturaIA?.manual).toBe(true)
    expect(doc.huellaArchivo).toBe('abc')
    // Aunque una persona complete todo, la aprobación en bloque no la toma: se valida una por una.
    expect(esAprobable({ ...doc, camposIncompletos: [] }, CLIENTE.rncCedula)).toBe(false)
  })

  it('un documento que ya agotó la lectura se marca manual sin leer', () => {
    const b = marcarCapturaManual({ ...interpretarPagina(null, ctx()) }, [MOTIVO_YA_AGOTADA], '')
    expect(b.leidaConIA).toBe(true)
    expect(b.lecturaIA?.motivos).toEqual([MOTIVO_YA_AGOTADA])
  })

  it('una lectura que pasa guarda qué modelo la hizo', () => {
    const b = aplicarResultado(interpretarPagina(null, ctx()), { lectura: buena(), modelo: MODELO_OCR_POR_DEFECTO, releida: false, manual: false, motivos: [] }, ctx())
    expect(b.lecturaIA).toEqual({ modelo: MODELO_OCR_POR_DEFECTO, releida: false, manual: false, motivos: [] })
    expect(observaciones(b, CLIENTE.rncCedula)).toEqual([])
  })
})

describe('huellaDe', () => {
  it('mismo contenido, misma huella; distinto contenido, distinta', async () => {
    const a = await huellaDe(new Blob(['factura 1']))
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await huellaDe(new Blob(['factura 1']))).toBe(a)
    expect(await huellaDe(new Blob(['factura 2']))).not.toBe(a)
  })
})
