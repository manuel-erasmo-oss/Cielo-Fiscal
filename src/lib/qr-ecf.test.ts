import { describe, expect, it } from 'vitest'
import { leerQrEcf, pertenenciaSegunQr } from './qr-ecf'

// Mismas formas que se vieron en facturas reales, con datos inventados.
const BASE = 'https://ecf.dgii.gov.do/ecf/ConsultaTimbre?RncEmisor=101123451&RncComprador=401007551&ENCF=E310000007629&FechaEmision=01-07-2026&MontoTotal=2440.24&FechaFirma=01-07-2026+16:03:51&CodigoSeguridad=AbC123'

describe('leerQrEcf', () => {
  it('lee emisor, comprador, e-NCF, fecha y total', () => {
    expect(leerQrEcf(BASE)).toEqual({
      rncEmisor: '101123451', rncComprador: '401007551', encf: 'E310000007629', fechaEmision: '2026-07-01', montoTotal: 2440.24,
    })
  })

  it('no distingue mayúsculas en los nombres de los parámetros ni en la ruta', () => {
    for (const variante of ['RNCEmisor', 'rncemisor', 'RNCEMISOR']) {
      const url = BASE.replace('RncEmisor', variante).replace('/ecf/', '/eCF/')
      expect(leerQrEcf(url)?.rncEmisor, variante).toBe('101123451')
    }
  })

  it('limpia la coma de miles del total y acepta %20 en la fecha de firma', () => {
    const url = BASE.replace('MontoTotal=2440.24', 'MontoTotal=2,116.22').replace('2026+16', '2026%2016')
    expect(leerQrEcf(url)?.montoTotal).toBe(2116.22)
  })

  it('sin comprador (factura de consumo) sigue siendo válido', () => {
    const url = 'https://fc.dgii.gov.do/eCF/ConsultaTimbreFC?RncEmisor=101123451&ENCF=E320000000015&MontoTotal=590.00&CodigoSeguridad=x'
    expect(leerQrEcf(url)).toEqual({ rncEmisor: '101123451', rncComprador: null, encf: 'E320000000015', fechaEmision: null, montoTotal: 590 })
  })

  it('una fecha imposible queda en null sin invalidar el resto', () => {
    expect(leerQrEcf(BASE.replace('FechaEmision=01-07-2026', 'FechaEmision=31-02-2026'))).toMatchObject({ encf: 'E310000007629', fechaEmision: null })
  })

  it.each([
    ['texto que no es URL', 'hola'],
    ['URL de otro sitio', BASE.replace('ecf.dgii.gov.do', 'ejemplo.com')],
    ['dominio que solo termina parecido', BASE.replace('ecf.dgii.gov.do', 'falsodgii.gov.do.evil.com')],
    ['sin e-NCF', BASE.replace('ENCF=E310000007629', 'ENCF=')],
    ['e-NCF con estructura incorrecta', BASE.replace('ENCF=E310000007629', 'ENCF=B0100000001')],
    ['RNC de emisor inválido', BASE.replace('RncEmisor=101123451', 'RncEmisor=123')],
  ])('rechaza: %s', (_nombre, texto) => {
    expect(leerQrEcf(texto)).toBeNull()
  })
})

describe('pertenenciaSegunQr', () => {
  const qr = leerQrEcf(BASE)!

  it('compra si el cliente es el comprador; venta si es el emisor', () => {
    expect(pertenenciaSegunQr(qr, '401007551')).toBe('compra')
    expect(pertenenciaSegunQr(qr, '101123451')).toBe('venta')
  })

  it('e-CF de compras, gastos menores o pagos al exterior emitido por el cliente: compra', () => {
    for (const encf of ['E410000000001', 'E430000000001', 'E470000000001']) {
      expect(pertenenciaSegunQr({ ...qr, encf }, '101123451'), encf).toBe('compra')
    }
  })

  it('ajena si nombra a otros dos; indeterminada si no trae comprador', () => {
    expect(pertenenciaSegunQr(qr, '130000001')).toBe('ajena')
    expect(pertenenciaSegunQr({ ...qr, rncComprador: null }, '130000001')).toBe('indeterminada')
  })
})
