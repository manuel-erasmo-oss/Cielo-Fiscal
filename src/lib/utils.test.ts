import { describe, expect, it } from 'vitest'
import { fechaLocalISO, formatCedula, formatRD, parseFechaLocal, redondear2, soloDigitos } from './utils'

describe('parseFechaLocal', () => {
  it('corre en la zona horaria de RD', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/Santo_Domingo')
  })

  it('devuelve el día calendario escrito, no el anterior', () => {
    const d = parseFechaLocal('2026-03-01')
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 3, 1])
  })

  it('new Date(iso) sí cae en el día anterior (el bug que se evita)', () => {
    expect(new Date('2026-03-01').getDate()).toBe(28)
  })

  it('ida y vuelta con fechaLocalISO', () => {
    for (const iso of ['2026-01-01', '2026-12-31', '2028-02-29']) {
      expect(fechaLocalISO(parseFechaLocal(iso))).toBe(iso)
    }
  })

  it.each(['2026-02-30', '2027-02-29', '2026-13-01', '2026-3-1', '2026-03-01T00:00:00Z', '', '01/03/2026'])(
    'rechaza %j',
    malo => expect(() => parseFechaLocal(malo)).toThrow(),
  )
})

describe('números e identificadores', () => {
  it('redondear2 corrige la suma binaria', () => {
    expect(redondear2(0.1 + 0.2)).toBe(0.3)
    expect(redondear2(1.005)).toBe(1.01)
  })

  it('formatRD', () => {
    expect(formatRD(1234.5)).toBe('RD$1,234.50')
  })

  it('soloDigitos y formatCedula', () => {
    expect(soloDigitos('1-01-12345-6')).toBe('101123456')
    expect(formatCedula('00112345678')).toBe('001-1234567-8')
    expect(formatCedula('101123456')).toBe('101123456')
  })
})
