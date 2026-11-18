import { describe, expect, it } from 'vitest'
import { iniciales } from './monograma'

describe('iniciales del monograma', () => {
  it('toma las dos primeras palabras que cuentan, sin la forma jurídica ni conectores', () => {
    expect(iniciales('Comercial Alfa SRL')).toBe('CA')
    expect(iniciales('Distribuidora de Materiales del Este, S.R.L.')).toBe('DM')
    expect(iniciales('Ferretería El Sol, SRL')).toBe('FS')
  })
  it('con una sola palabra usa sus dos primeras letras', () => {
    expect(iniciales('Inversiones SRL')).toBe('IN')
    expect(iniciales('')).toBe('?')
  })
})
