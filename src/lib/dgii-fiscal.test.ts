import { describe, expect, it } from 'vitest'
import {
  calcularISRAnualPersonaFisica,
  calcularITBISDelMes,
  fechaLimiteIR17,
  fechaLimiteIT1,
  fechaLimiteMesSiguiente,
  proyectarISR,
} from './dgii-fiscal'

describe('fechas límite', () => {
  it('caen en el mes siguiente al período', () => {
    expect(fechaLimiteIR17(2026, 11)).toBe('2026-12-10')
    expect(fechaLimiteIT1(2026, 11)).toBe('2026-12-20')
  })

  it('diciembre pasa a enero del año siguiente', () => {
    expect(fechaLimiteIR17(2026, 12)).toBe('2027-01-10')
    expect(fechaLimiteIT1(2026, 12)).toBe('2027-01-20')
  })

  it('rechaza un mes fuera de 1-12', () => {
    expect(() => fechaLimiteMesSiguiente(2026, 0, 10)).toThrow()
    expect(() => fechaLimiteMesSiguiente(2026, 13, 10)).toThrow()
  })
})

describe('calcularITBISDelMes', () => {
  it('a pagar cuando lo facturado supera lo adelantado', () => {
    expect(calcularITBISDelMes({ itbisFacturado: 18000, itbisAdelantado: 5400.1, saldoAFavorAnterior: 1000.2 }))
      .toEqual({ itbisAPagar: 11599.7, saldoAFavorSiguiente: 0 })
  })

  it('saldo a favor cuando lo adelantado supera lo facturado', () => {
    expect(calcularITBISDelMes({ itbisFacturado: 1000, itbisAdelantado: 5400 }))
      .toEqual({ itbisAPagar: 0, saldoAFavorSiguiente: 4400 })
  })

  it('exactamente cero', () => {
    expect(calcularITBISDelMes({ itbisFacturado: 500, itbisAdelantado: 500 }))
      .toEqual({ itbisAPagar: 0, saldoAFavorSiguiente: 0 })
  })

  it('rechaza montos negativos o no numéricos', () => {
    expect(() => calcularITBISDelMes({ itbisFacturado: -1, itbisAdelantado: 0 })).toThrow()
    expect(() => calcularITBISDelMes({ itbisFacturado: NaN, itbisAdelantado: 0 })).toThrow()
  })
})

describe('ISR', () => {
  it('persona física: bordes de cada tramo', () => {
    expect(calcularISRAnualPersonaFisica(416_220)).toBe(0)
    expect(calcularISRAnualPersonaFisica(624_329)).toBeCloseTo(31_216.35, 2)
    expect(calcularISRAnualPersonaFisica(867_123)).toBeCloseTo(79_774.8, 2)
    expect(proyectarISR('fisica', 1_000_000)).toBe(112_995.25)
  })

  it('persona jurídica: 27% y nunca negativo', () => {
    expect(proyectarISR('juridica', 1_000_000)).toBe(270_000)
    expect(proyectarISR('juridica', -50)).toBe(0)
  })
})
